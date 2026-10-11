import "server-only";
import { spawn } from "node:child_process";
import { getDb, schema } from "../db/client";
import { SPARK_HOST, sparkExec } from "../spark/ssh";
import {
  CENARIOS,
  cenariosAplicaveis,
  comandoCenario,
  comandoSubir,
  lerSaida,
  PASTA_REMOTA,
  SPARK_BENCH_DIR,
  type CenarioId,
  type Combinacao,
} from "./spark";

type BenchRun = typeof schema.benchRuns.$inferSelect;

const CONTAINERS = ["glis-chat", "glis-code", "glis-embed", "glis-rerank"];
const LIBERAR_COMFY = `curl -s -m 30 -X POST -H 'Content-Type: application/json' -d '{"unload_models":true,"free_memory":true}' http://127.0.0.1:8188/free >/dev/null; true`;

/** Copia bench/spark para ~/icewall-bench no Spark (tar por ssh: sem rsync e sem pasta temporária). */
export function enviarBancada(): Promise<void> {
  return new Promise((resolve, reject) => {
    const tar = spawn("tar", ["cf", "-", "-C", SPARK_BENCH_DIR, "."], { stdio: ["ignore", "pipe", "pipe"] });
    const ssh = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", SPARK_HOST, `mkdir -p ${PASTA_REMOTA} && tar xf - -C ${PASTA_REMOTA}`], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    tar.stdout.pipe(ssh.stdin);
    let erro = "";
    ssh.stderr.on("data", (d: Buffer) => (erro += d.toString()));
    ssh.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`falha ao copiar a bancada para o Spark: ${erro.trim() || code}`))));
    tar.on("error", reject);
    ssh.on("error", reject);
  });
}

async function remoto(cmd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return sparkExec(cmd, timeoutMs);
}

/** Para o Ollama (devolve se ele estava rodando) e deixa o Spark limpo para a combinação. */
export async function prepararSpark(): Promise<boolean> {
  const r = await remoto("docker inspect -f '{{.State.Running}}' ollama 2>/dev/null", 20_000);
  const estava = r.stdout.trim() === "true";
  if (estava) await remoto("docker stop ollama", 90_000);
  await limparServicos();
  return estava;
}

export async function limparServicos(): Promise<void> {
  await remoto(`docker rm -f ${CONTAINERS.join(" ")} >/dev/null 2>&1; ${LIBERAR_COMFY}`, 120_000);
}

export async function restaurarSpark(ollamaEstava: boolean): Promise<void> {
  await limparServicos();
  if (ollamaEstava) await remoto("docker start ollama", 90_000);
}

function inserir(run: BenchRun, comb: string, task: string, sample: number, values: Partial<typeof schema.benchResults.$inferInsert>) {
  getDb()
    .insert(schema.benchResults)
    .values({ benchRunId: run.id, model: comb, task, sample, ok: false, ...values })
    .run();
}

function temErro(l: Record<string, unknown>): boolean {
  const e = l.erros;
  return (typeof e === "number" && e > 0) || (Array.isArray(e) && e.length > 0) || Number(l.n_erros ?? 0) > 0 || Boolean(l.erro);
}

/**
 * Sobe a combinação, roda os cenários pedidos que se aplicam a ela e derruba tudo.
 * Cada passo vira uma linha em bench_results (model = id da combinação, task = cenário).
 */
export async function executarCombinacao(
  run: BenchRun,
  comb: Combinacao,
  sample: number,
  onItem: (label: string) => void,
  cancelled: () => boolean,
): Promise<void> {
  onItem(`${comb.id} · subindo ${comb.servicos.length} serviço(s)`);
  const inicio = Date.now();
  const segundos: Record<string, number> = {};
  for (const s of comb.servicos) {
    const r = await remoto(comandoSubir(s), 17 * 60_000);
    const ok = /^ok (\S+) (\d+)/m.exec(r.stdout);
    if (!ok) {
      inserir(run, comb.id, "subida", sample, {
        durationS: (Date.now() - inicio) / 1000,
        metricas: { segundos, falhou: s.container },
        error: (r.stdout + r.stderr).trim().slice(-2000) || `saiu com ${r.code}`,
      });
      await limparServicos();
      return;
    }
    segundos[ok[1]] = Number(ok[2]);
  }
  inserir(run, comb.id, "subida", sample, { ok: true, durationS: (Date.now() - inicio) / 1000, metricas: { segundos } });

  if (comb.gate) await remoto(`cd ${PASTA_REMOTA} && (nohup python3 gate.py 1.0 >gate.out 2>&1 </dev/null & echo $! >gate.pid)`, 20_000);
  try {
    for (const id of cenariosAplicaveis(comb, run.tasks)) {
      if (cancelled()) return;
      await rodarCenario(run, comb, id, sample, onItem);
    }
  } finally {
    if (comb.gate) {
      const r = await remoto(`cd ${PASTA_REMOTA} && kill -TERM $(cat gate.pid) 2>/dev/null; sleep 1; cat gate.out`, 20_000);
      const m = /gate: (\d+) pausas, ([\d.]+) s pausado/.exec(r.stdout);
      inserir(run, comb.id, "gate", sample, { ok: Boolean(m), metricas: m ? { pausas: Number(m[1]), pausadoS: Number(m[2]) } : { saida: r.stdout.slice(-500) } });
    }
    await limparServicos();
  }
}

async function rodarCenario(run: BenchRun, comb: Combinacao, id: CenarioId, sample: number, onItem: (label: string) => void) {
  onItem(`${comb.id} · ${CENARIOS[id].titulo}`);
  const inicio = Date.now();
  const r = await remoto(comandoCenario(id), CENARIOS[id].timeoutS * 1000);
  const s = lerSaida(r.stdout);
  const ok = r.code === 0 && (s.linhas.length > 0 || s.acertos !== null) && !s.linhas.some(temErro);
  inserir(run, comb.id, id, sample, {
    ok,
    exitCode: r.code,
    durationS: (Date.now() - inicio) / 1000,
    metricas: { linhas: s.linhas, memMinMb: s.memMinMb, acertos: s.acertos, texto: s.texto.slice(-6000) },
    error: ok ? null : r.stderr.trim().slice(-2000) || null,
  });
}

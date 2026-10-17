import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { addEvent } from "../lib/store";
import { parseSections } from "../parsers";
import { driverFor, execOnServer } from "../executor";
import { shellArg, shellPath } from "../spark/ssh";
import { fundirLossHistory, parseTrainLog, type TrainMarker } from "./parse-log";
import { homeServidor } from "./datasets";

/**
 * Runner de treinos (Fase 2, Etapa T2) — espelha a fila de benchmarks, mas
 * o treino roda DESACOPLADO do painel: nohup + pid no servidor (sobrevive a
 * restart do painel), e cada tick do agendador (5 s) faz um poll do log.
 *
 * Por tick:
 *   1. job "running" → poll (tail do train.log, marcadores @@ICW, GPU,
 *      final.status) e atualiza progresso/loss; finaliza quando encerra.
 *   2. senão, próximo "queued" → inicia (lock não-bloqueante do
 *      delegate-local, workspace /tmp/icewall-train-{id}, upload do
 *      fine_tune.py e do run.sh, nohup do container icewall-train:{id}).
 *
 * O treino roda no container `icewall-train:latest` (derivado da imagem vLLM
 * local: torch + transformers + peft + datasets) com o script versionado em
 * `deploy/train/fine_tune.py` — nunca num script que a imagem "traria".
 */

type TrainJob = typeof schema.trainJobs.$inferSelect;

const IMAGEM_TREINO = "icewall-train:latest";
const LOCK_DELEGATE = path.join(os.homedir(), ".cache", "delegate-local", "lock");
const LOCK_MAX_SEGUNDOS = 24 * 3600;

const g = globalThis as unknown as {
  __icewallTrainBusy?: boolean;
  __icewallTrainLock?: ChildProcess | null;
  __icewallTrainLockAviso?: boolean;
};

function progress(id: number, set: Partial<typeof schema.trainJobs.$inferInsert>) {
  getDb().update(schema.trainJobs).set({ ...set, updatedTs: Date.now() }).where(eq(schema.trainJobs.id, id)).run();
}

function jobPorId(id: number): TrainJob | undefined {
  return getDb().select().from(schema.trainJobs).where(eq(schema.trainJobs.id, id)).limit(1).get();
}

const workspaceDe = (home: string, id: number) => `${home}/icewall/workspaces/train-${id}`;
const containerDe = (id: number) => `icewall-train-${id}`;

// ── lock do delegate-local (não-bloqueante; segura enquanto o treino roda) ──

const SEM_LOCK = { pid: null } as unknown as ChildProcess;

function tentarLock(maxSeconds: number): Promise<ChildProcess | null> {
  // Ganchos de teste/operação manual: sem flock, o treino inicia direto.
  if (process.env.ICEWALL_TRAIN_LOCK_DISABLE === "1") {
    g.__icewallTrainLock = null; // soltarLock vira no-op
    return Promise.resolve(SEM_LOCK);
  }
  // flock precisa do diretório (cria o arquivo se faltar) — padrão do bench.
  fs.mkdirSync(path.dirname(LOCK_DELEGATE), { recursive: true });
  return new Promise((resolve) => {
    const holder = spawn(
      "flock",
      ["-n", LOCK_DELEGATE, "-c", `echo ICW-LOCKED; exec sleep ${Math.floor(maxSeconds)}`],
      { stdio: ["ignore", "pipe", "ignore"], detached: true }, // grupo próprio: o sleep herda o fd e morre junto
    );
    let resolvido = false;
    const decidir = (seguro: boolean) => {
      if (resolvido) return;
      resolvido = true;
      resolve(seguro ? holder : null);
    };
    // flock -n ocupado encerra rápido com exit 1 → close sem LOCKED = não segurou.
    // Se nada chegou em 1,5 s, assumimos seguro (echo + exec são imediatos).
    const timer = setTimeout(() => decidir(true), 1500);
    holder.stdout?.on("data", (d: Buffer) => {
      if (d.toString().includes("ICW-LOCKED")) decidir(true);
    });
    holder.on("close", () => decidir(false));
    holder.on("error", () => decidir(false));
  });
}

function soltarLock(): void {
  const holder = g.__icewallTrainLock;
  g.__icewallTrainLock = null;
  if (!holder?.pid) return;
  try {
    process.kill(-holder.pid, "SIGTERM"); // grupo próprio do detached
  } catch {
    try {
      holder.kill("SIGTERM");
    } catch {
      // já morto
    }
  }
}

// ── início do job ───────────────────────────────────────────────────────────

function argsFineTune(job: TrainJob): string {
  const p = job.paramsJson;
  if (!p) throw new Error(`job ${job.id} sem paramsJson`);
  const partes = [
    `--model ${shellArg(job.baseModel)}`,
    `--dataset ${shellPath(`/data/${job.datasetPath?.split("/").pop() ?? "dataset.jsonl"}`)}`,
    `--out /workspace/out`,
    `--epochs ${Math.floor(p.epochs)}`,
    `--lr ${Number(p.learningRate)}`,
    `--batch-size ${Math.floor(p.batchSize)}`,
    `--grad-accum ${Math.floor(p.gradientAccumulationSteps)}`,
    `--max-seq-len ${Math.floor(p.maxSeqLength)}`,
    p.maxSamples ? `--max-samples ${Math.floor(p.maxSamples)}` : "",
    `--r ${Math.floor(p.r)}`,
    `--alpha ${Math.floor(p.alpha)}`,
    `--dropout ${Number(p.dropout)}`,
    job.method === "qlora" ? "--qlora" : "",
    job.method === "full" ? "--full" : "",
    p.bf16 ? "--bf16" : "",
  ].filter(Boolean);
  return partes.join(" ");
}

async function iniciarJob(job: TrainJob): Promise<void> {
  const holder = await tentarLock(LOCK_MAX_SEGUNDOS);
  if (!holder) {
    // Delegação ou bench segurando o lock: tenta de novo no próximo tick.
    if (!g.__icewallTrainLockAviso) {
      addEvent("train", "info", `Treino #${job.id} aguardando o lock do delegate-local`, undefined, job.serverId);
      g.__icewallTrainLockAviso = true;
    }
    return;
  }
  g.__icewallTrainLock = holder;
  g.__icewallTrainLockAviso = false;

  // Workspaces vivem em $HOME (o /tmp deste host é limpo agressivamente pelo
  // systemd-tmpfiles — perdeu adapters em produção de teste).
  const home = await homeServidor(job.serverId);
  const ws = workspaceDe(home, job.id);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "icewall-trainprep-"));
  let driver: ReturnType<typeof driverFor> | null = null;
  try {
    const datasetDir = job.datasetPath?.split("/").slice(0, -1).join("/") ?? "";
    const hfCache = `${home}/icewall/hf-cache`;
    const runSh = [
      `docker rm -f ${shellArg(containerDe(job.id))} >/dev/null 2>&1 || true`,
      `docker run --rm --name ${shellArg(containerDe(job.id))} --gpus all \\`,
      `  -v ${shellPath(ws)}:/workspace \\`,
      `  -v ${shellPath(datasetDir)}:/data:ro \\`,
      `  -v ${shellPath(hfCache)}:/root/.cache/huggingface \\`,
      `  ${IMAGEM_TREINO} \\`,
      `  python3 /workspace/fine_tune.py ${argsFineTune(job)}`,
      `echo "exit=$?" > ${shellPath(ws)}/final.status`,
    ].join("\n");

    const tmpPy = path.join(tmp, "fine_tune.py");
    fs.copyFileSync(path.join(process.cwd(), "deploy", "train", "fine_tune.py"), tmpPy);
    const tmpSh = path.join(tmp, "run.sh");
    fs.writeFileSync(tmpSh, `${runSh}\n`, "utf8");

    driver = driverFor(job.serverId);
    await driver.mkdir(ws, "755");
    await driver.mkdir(`${home}/icewall/hf-cache`, "755");
    await driver.put(tmpPy, `${ws}/fine_tune.py`);
    await driver.put(tmpSh, `${ws}/run.sh`);  } catch (err) {
    soltarLock();
    progress(job.id, {
      status: "failed",
      error: `falha ao preparar o workspace: ${String(err instanceof Error ? err.message : err)}`,
      finishedAt: Date.now(),
    });
    return;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    driver?.close();
  }

  const wsS = shellPath(ws);
  const lancar = `rm -f ${wsS}/final.status ${wsS}/train.log; nohup sh ${wsS}/run.sh > ${wsS}/train.log 2>&1 & echo $! > ${wsS}/job.pid; cat ${wsS}/job.pid`;
  const res = await execOnServer(job.serverId, lancar, 15_000);
  if (res.code !== 0 || !res.stdout.trim()) {
    soltarLock();
    progress(job.id, {
      status: "failed",
      error: `falha ao lançar o treino: ${res.stderr.trim() || `exit ${res.code}`}`,
      finishedAt: Date.now(),
    });
    return;
  }

  const pid = Number(res.stdout.trim());
  progress(job.id, {
    status: "running",
    startedAt: Date.now(),
    workspacePath: ws,
    remotePid: Number.isFinite(pid) && pid > 0 ? pid : null,
    current: "container lançado",
    error: null,
    progressPct: 0,
    lossHistory: [],
    epochsDone: 0,
    totalEpochs: job.paramsJson?.epochs ?? 0,
  });
  addEvent("train", "info", `Treino #${job.id} iniciado (${job.baseModel}, ${job.method})`, undefined, job.serverId);
}

// ── poll do job em execução ─────────────────────────────────────────────────

function numSecao(secoes: Record<string, string>, chave: string): string {
  return (secoes[chave] ?? "").trim();
}

async function finalizarRemoto(job: TrainJob): Promise<void> {
  try {
    await execOnServer(
      job.serverId,
      `docker rm -f ${shellArg(containerDe(job.id))} >/dev/null 2>&1; pid=$(cat ${shellPath(job.workspacePath ?? "")}/job.pid 2>/dev/null); [ -n "$pid" ] && kill "$pid" 2>/dev/null; true`,
      15_000,
    );
  } catch {
    // melhor esforço: o job já saiu da fila
  }
}

async function pollJob(job: TrainJob): Promise<void> {
  const atual = jobPorId(job.id);
  if (!atual || atual.status !== "running") return;

  // (Cancelamentos são limpos pelo branch próprio do tick — ver processTrainQueue.)

  const ws = atual.workspacePath;
  if (!ws) {
    progress(atual.id, { status: "failed", error: "job em execução sem workspacePath", finishedAt: Date.now() });
    soltarLock();
    return;
  }

  const wsS = shellPath(ws);
  const cmd = [
    `echo @@status@@; cat ${wsS}/final.status 2>/dev/null || echo none`,
    `echo @@alive@@; pid=$(cat ${wsS}/job.pid 2>/dev/null); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo yes; else echo no; fi`,
    `echo @@gpu@@; nvidia-smi --query-compute-apps=used_memory --format=csv,noheader,nounits 2>/dev/null | awk '{s+=$1} END {print s+0}'`,
    `echo @@log@@; tail -n 160 ${wsS}/train.log 2>/dev/null`,
  ].join("; ");

  const res = await execOnServer(atual.serverId, cmd, 20_000);
  if (res.code !== 0 && !res.stdout.includes("@@log@@")) {
    // Falha de comunicação transitória: mantém running e tenta no próximo tick.
    progress(atual.id, { current: "falha temporária de comunicação" });
    return;
  }
  // O log é a última seção e contém linhas @@ICW …@@ que confundiriam o
  // parseSections (ele trataria cada marcador como nova seção): separa à mão.
  const idxLog = res.stdout.indexOf("@@log@@\n");
  const logParte = idxLog >= 0 ? res.stdout.slice(idxLog + "@@log@@\n".length) : "";
  const s = parseSections(idxLog >= 0 ? res.stdout.slice(0, idxLog) : res.stdout);
  const finalStatus = numSecao(s, "status");
  const alive = numSecao(s, "alive") === "yes";
  const gpuMib = Number(numSecao(s, "gpu")) || null;
  const marcadores: TrainMarker[] = parseTrainLog(logParte);
  const lossHistory = fundirLossHistory(atual.lossHistory, marcadores);
  const erroMarker = [...marcadores].reverse().find((m) => m.type === "error") as { type: "error"; message: string } | undefined;
  const doneMarker = [...marcadores].reverse().find((m) => m.type === "done") as { type: "done"; train_loss: number | null } | undefined;
  const ultimoStep = [...marcadores].reverse().find((m) => m.type === "step") as { type: "step"; step: number; epoch: number } | undefined;

  const totalEpochs = atual.totalEpochs || atual.paramsJson?.epochs || 0;
  const epochsFeitos = ultimoStep ? Math.min(totalEpochs || Infinity, ultimoStep.epoch) : atual.epochsDone;
  const pct = totalEpochs > 0 && ultimoStep ? Math.min(99, Math.round((ultimoStep.epoch / totalEpochs) * 100)) : atual.progressPct;

  // Encerrou por final.status?
  const mExit = /^exit=(\d+)$/.exec(finalStatus);
  if (mExit) {
    const exit = Number(mExit[1]);
    soltarLock();
    if (exit === 0) {
      progress(atual.id, {
        status: "done",
        progressPct: 100,
        epochsDone: totalEpochs || Math.floor(epochsFeitos),
        valLoss: doneMarker?.train_loss ?? atual.valLoss ?? null,
        lossHistory,
        gpuMemUsedMib: gpuMib,
        current: "concluído",
        finishedAt: Date.now(),
      });
      // Adapter materializado vira artifact (T4 o promove ao serving).
      const adapterJa = getDb()
        .select({ id: schema.trainArtifacts.id })
        .from(schema.trainArtifacts)
        .where(and(eq(schema.trainArtifacts.jobId, atual.id), eq(schema.trainArtifacts.kind, "adapter")))
        .limit(1)
        .get();
      if (!adapterJa && ws) {
        getDb()
          .insert(schema.trainArtifacts)
          .values({ jobId: atual.id, serverId: atual.serverId, kind: "adapter", remotePath: `${ws}/out/adapter`, status: "done" })
          .run();
      }
      addEvent("train", "info", `Treino #${atual.id} concluído`, { lossFinal: doneMarker?.train_loss ?? null }, atual.serverId);
    } else {
      progress(atual.id, {
        status: "failed",
        error: erroMarker?.message ?? `container saiu com exit ${exit}`,
        lossHistory,
        finishedAt: Date.now(),
      });
      addEvent("train", "crit", `Treino #${atual.id} falhou (exit ${exit})`, undefined, atual.serverId);
    }
    return;
  }

  // Morreu sem final.status (nohup abortado, OOM do host…)
  if (!alive) {
    soltarLock();
    progress(atual.id, {
      status: "failed",
      error: erroMarker?.message ?? "processo de treino terminou sem final.status",
      lossHistory,
      finishedAt: Date.now(),
    });
    addEvent("train", "crit", `Treino #${atual.id} morreu sem status final`, undefined, atual.serverId);
    return;
  }

  progress(atual.id, {
    lossHistory,
    progressPct: pct,
    epochsDone: Math.floor(epochsFeitos),
    gpuMemUsedMib: gpuMib,
    current: ultimoStep ? `step ${ultimoStep.step}` : "treinando",
  });
}

// ── entrada do agendador ────────────────────────────────────────────────────

/** Chamado pelo agendador (a cada 5 s): polla o job em execução, limpa cancelados ou inicia o próximo. */
export async function processTrainQueue(): Promise<void> {
  if (g.__icewallTrainBusy) return;
  g.__icewallTrainBusy = true;
  try {
    const emExecucao = getDb()
      .select()
      .from(schema.trainJobs)
      .where(eq(schema.trainJobs.status, "running"))
      .orderBy(schema.trainJobs.id)
      .get();
    if (emExecucao) {
      await pollJob(emExecucao);
      return;
    }

    // Cancelado com workspace: falta remover o container remoto (o stop route
    // só marca o status). Limpa e esvazia os campos remotos para não repetir.
    const cancelado = getDb()
      .select()
      .from(schema.trainJobs)
      .where(and(eq(schema.trainJobs.status, "cancelled"), isNotNull(schema.trainJobs.workspacePath)))
      .orderBy(schema.trainJobs.id)
      .get();
    if (cancelado) {
      await finalizarRemoto(cancelado);
      progress(cancelado.id, { workspacePath: null, remotePid: null, current: "cancelado" });
      return;
    }

    const proximo = getDb()
      .select()
      .from(schema.trainJobs)
      .where(eq(schema.trainJobs.status, "queued"))
      .orderBy(schema.trainJobs.id)
      .get();
    if (proximo) await iniciarJob(proximo);
  } catch (err) {
    // Nunca derruba o scheduler por um poll que falhou.
    console.error("[icewall] fila de treinos:", err);
  } finally {
    g.__icewallTrainBusy = false;
  }
}

/** Treinos que ficaram "running" quando o painel reiniciou não vão terminar: marca como falhos. */
export function recoverStaleTrain(): void {
  getDb()
    .update(schema.trainJobs)
    .set({ status: "failed", error: "painel reiniciado durante o treino", finishedAt: Date.now(), updatedTs: Date.now() })
    .where(eq(schema.trainJobs.status, "running"))
    .run();
}

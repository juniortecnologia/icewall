import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { driverFor, execOnServer } from "../executor";
import { shellArg, shellPath } from "../spark/ssh";
import { homeServidor, slugBase } from "./datasets";

/**
 * Fila de exports GGUF (Fase 2, Etapa T3) — mesmo padrão da fila de treinos:
 * o registro `train_artifacts` nasce 'pending' com o caminho final esperado e
 * o tick (5 s) processa um por vez, via nohup no servidor (desacoplado do
 * painel) no container `icewall-quant:latest` (icewall-train + gguf +
 * llama.cpp com llama-quantize).
 *
 * Pipeline por export: mescla o adapter no base (peft merge_and_unload, uma
 * vez por workspace) → convert_hf_to_gguf.py (f16 ou q8_0) → llama-quantize
 * (q4_k_m e demais K-quants) → final.status.
 *
 * NÃO disputa a GPU: conversão e quantização rodam em CPU — sem lock do
 * delegate-local.
 */

type Artifact = typeof schema.trainArtifacts.$inferSelect;
type TrainJob = typeof schema.trainJobs.$inferSelect;

export const IMAGEM_QUANT = "icewall-quant:latest";
export const QUANTS = ["f16", "q8_0", "q4_k_m"] as const;
export type Quant = (typeof QUANTS)[number];

const g = globalThis as unknown as { __icewallExportBusy?: boolean };

function progress(id: number, set: Partial<typeof schema.trainArtifacts.$inferInsert>) {
  getDb().update(schema.trainArtifacts).set({ ...set, atualizadoEm: Date.now() }).where(eq(schema.trainArtifacts.id, id)).run();
}

const exportDirDe = (ws: string, quant: string) => `${ws}/export-${quant}`;
const containerDe = (id: number) => `icewall-export-${id}`;
const ggufDe = (ws: string, quant: string) => `${exportDirDe(ws, quant)}/gguf-${quant}.gguf`;

export function ehQuant(valor: string): valor is Quant {
  return (QUANTS as readonly string[]).includes(valor);
}

// ── início do export ────────────────────────────────────────────────────────

function innerSh(job: TrainJob, quant: Quant): string {
  const modelo = shellArg(job.baseModel);
  const outtype = quant === "q8_0" ? "q8_0" : "f16"; // q4_k_m: f16 intermediário + llama-quantize
  const dir = `/workspace/export-${quant}`;
  return [
    `# 1. mescla o adapter no base (uma vez por workspace; full pula direto)`,
    `MODELO=/workspace/merged`,
    `if [ ! -d "$MODELO" ]; then`,
    `  if [ -f /workspace/out/adapter/adapter_config.json ]; then`,
    `    python3 /workspace/merge_lora.py --base ${modelo} --adapter /workspace/out/adapter --out "$MODELO" --bf16 || exit 1`,
    `  else`,
    `    MODELO=/workspace/out/adapter`,
    `  fi`,
    `fi`,
    `# 2. conversão para GGUF`,
    `python3 /opt/llama.cpp/convert_hf_to_gguf.py "$MODELO" --outfile ${shellPath(`${dir}/f16.tmp.gguf`)} --outtype ${outtype} || exit 1`,
    `# 3. quantização K-quant`,
    `if [ "${quant}" != "f16" ] && [ "${quant}" != "q8_0" ]; then`,
    `  /opt/llama.cpp/build/bin/llama-quantize ${shellPath(`${dir}/f16.tmp.gguf`)} ${shellPath(`${dir}/gguf-${quant}.gguf`)} ${quant} || exit 1`,
    `  rm -f ${shellPath(`${dir}/f16.tmp.gguf`)}`,
    `else`,
    `  mv ${shellPath(`${dir}/f16.tmp.gguf`)} ${shellPath(`${dir}/gguf-${quant}.gguf`)}`,
    `fi`,
  ].join("\n");
}

async function iniciarExport(artifact: Artifact): Promise<void> {
  const job = artifact.jobId ? getDb().select().from(schema.trainJobs).where(eq(schema.trainJobs.id, artifact.jobId)).limit(1).get() : undefined;
  if (!job || !job.workspacePath) {
    progress(artifact.id, { status: "failed", error: "job do export sem workspace no servidor" });
    return;
  }
  const ws = job.workspacePath;
  const quant = (artifact.quant ?? "f16") as Quant;
  const expDir = exportDirDe(ws, quant);
  const hfCache = `${await homeServidor(artifact.serverId)}/icewall/hf-cache`;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "icewall-exportprep-"));
  let driver: ReturnType<typeof driverFor> | null = null;
  try {
    const inner = path.join(tmp, "inner.sh");
    fs.writeFileSync(inner, `${innerSh(job, quant)}\n`, "utf8");
    const exportSh = [
      `docker rm -f ${shellArg(containerDe(artifact.id))} >/dev/null 2>&1 || true`,
      `docker run --rm --name ${shellArg(containerDe(artifact.id))} \\`,
      `  -v ${shellPath(ws)}:/workspace \\`,
      `  -v ${shellPath(hfCache)}:/root/.cache/huggingface \\`,
      `  ${IMAGEM_QUANT} \\`,
      `  sh /workspace/export-${quant}/inner.sh`,
      `echo "exit=$?" > ${shellPath(`${expDir}/final.status`)}`,
    ].join("\n");
    const outer = path.join(tmp, "export.sh");
    fs.writeFileSync(outer, `${exportSh}\n`, "utf8");
    const mergePy = path.join(tmp, "merge_lora.py");
    fs.copyFileSync(path.join(process.cwd(), "deploy", "train", "merge_lora.py"), mergePy);

    driver = driverFor(artifact.serverId);
    await driver.mkdir(expDir, "755");
    await driver.put(inner, `${expDir}/inner.sh`);
    await driver.put(outer, `${expDir}/export.sh`);
    await driver.put(mergePy, `${ws}/merge_lora.py`);
  } catch (err) {
    progress(artifact.id, {
      status: "failed",
      error: `falha ao preparar o export: ${String(err instanceof Error ? err.message : err)}`,
    });
    return;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    driver?.close();
  }

  const expS = shellPath(expDir);
  const lancar = `rm -f ${expS}/final.status ${expS}/export.log; nohup sh ${expS}/export.sh > ${expS}/export.log 2>&1 & echo $! > ${expS}/job.pid; cat ${expS}/job.pid`;
  const res = await execOnServer(artifact.serverId, lancar, 15_000);
  if (res.code !== 0 || !res.stdout.trim()) {
    progress(artifact.id, { status: "failed", error: `falha ao lançar o export: ${res.stderr.trim() || `exit ${res.code}`}` });
    return;
  }
  progress(artifact.id, { status: "running", error: null });
}

// ── poll do export em execução ──────────────────────────────────────────────

async function pollExport(artifact: Artifact): Promise<void> {
  const atual = getDb().select().from(schema.trainArtifacts).where(eq(schema.trainArtifacts.id, artifact.id)).limit(1).get();
  if (!atual || atual.status !== "running") return;

  const job = atual.jobId ? getDb().select().from(schema.trainJobs).where(eq(schema.trainJobs.id, atual.jobId)).limit(1).get() : undefined;
  const ws = job?.workspacePath;
  if (!ws || !atual.quant) {
    progress(atual.id, { status: "failed", error: "export em execução sem workspace/quant" });
    return;
  }
  const expDir = exportDirDe(ws, atual.quant);
  const expS = shellPath(expDir);
  const cmd = [
    `echo @@status@@; cat ${expS}/final.status 2>/dev/null || echo none`,
    `echo @@size@@; stat -c %s ${shellPath(ggufDe(ws, atual.quant))} 2>/dev/null || echo 0`,
    `echo @@log@@; tail -n 60 ${expS}/export.log 2>/dev/null`,
  ].join("; ");

  const res = await execOnServer(atual.serverId, cmd, 20_000);
  if (res.code !== 0 && !res.stdout.includes("@@log@@")) {
    // falha transitória de comunicação: tenta no próximo tick
    return;
  }

  // O log é a última seção e pode conter linhas @@…@@ (do merge/convert):
  // separa à mão, como no runner de treinos.
  const idxLog = res.stdout.indexOf("@@log@@\n");
  const logParte = idxLog >= 0 ? res.stdout.slice(idxLog + "@@log@@\n".length) : "";
  const antes = idxLog >= 0 ? res.stdout.slice(0, idxLog) : res.stdout;
  const finalStatus = /@@status@@\n([\s\S]*?)\n@@/.exec(`${antes}\n@@`)?.[1]?.trim() ?? /@@status@@\n(.*)/.exec(antes)?.[1]?.trim() ?? "none";
  const size = Number(/@@size@@\n(\d+)/.exec(antes)?.[1] ?? 0) || 0;
  const mExit = /^exit=(\d+)$/.exec(finalStatus);

  if (mExit) {
    const exit = Number(mExit[1]);
    if (exit === 0 && size > 0) {
      progress(atual.id, { status: "done", sizeBytes: size });
      return;
    }
    progress(atual.id, {
      status: "failed",
      error: `export saiu com exit ${exit}${size === 0 ? " e sem GGUF" : ""}`,
    });
    return;
  }

  // Sem final.status: morreu? checa o pid
  const pidCmd = `pid=$(cat ${expS}/job.pid 2>/dev/null); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo yes; else echo no; fi`;
  const vivo = await execOnServer(atual.serverId, pidCmd, 10_000);
  if (vivo.stdout.trim() === "no") {
    progress(atual.id, {
      status: "failed",
      error: `processo de export terminou sem final.status; fim do log: ${logParte.trim().slice(-300) || "(vazio)"}`,
    });
  }
}

// ── entrada do agendador ────────────────────────────────────────────────────

/** Chamado pelo agendador (a cada 5 s): polla o export running ou inicia o próximo pending. */
export async function processExportQueue(): Promise<void> {
  if (g.__icewallExportBusy) return;
  g.__icewallExportBusy = true;
  try {
    const emExecucao = getDb()
      .select()
      .from(schema.trainArtifacts)
      .where(and(eq(schema.trainArtifacts.status, "running"), eq(schema.trainArtifacts.kind, "gguf")))
      .orderBy(schema.trainArtifacts.id)
      .get();
    if (emExecucao) {
      await pollExport(emExecucao);
      return;
    }
    const proximo = getDb()
      .select()
      .from(schema.trainArtifacts)
      .where(and(eq(schema.trainArtifacts.status, "pending"), eq(schema.trainArtifacts.kind, "gguf")))
      .orderBy(schema.trainArtifacts.id)
      .get();
    if (proximo) await iniciarExport(proximo);
  } catch (err) {
    console.error("[icewall] fila de exports:", err);
  } finally {
    g.__icewallExportBusy = false;
  }
}

/** Exports que ficaram "running" quando o painel reiniciou: marca como falhos. */
export function recoverStaleExports(): void {
  getDb()
    .update(schema.trainArtifacts)
    .set({ status: "failed", error: "painel reiniciado durante o export", atualizadoEm: Date.now() })
    .where(and(eq(schema.trainArtifacts.status, "running"), eq(schema.trainArtifacts.kind, "gguf")))
    .run();
}

/** Nome do arquivo GGUF para download (a partir do modelo base do job). */
export function nomeGguf(baseModel: string, quant: string): string {
  return `${slugBase(baseModel)}-${quant}.gguf`;
}

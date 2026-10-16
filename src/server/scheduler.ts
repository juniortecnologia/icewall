import "server-only";
import { lt, sql } from "drizzle-orm";
import { processBenchQueue, recoverStaleBench } from "./bench/runner";
import { getDb, schema } from "./db/client";
import { ingestClaudeUsage } from "./ingest/claude-usage";
import { ingestDelegateRuns } from "./ingest/delegate-runs";
import { runAuditor } from "./jev/auditor";
import { rebuildRecommendations } from "./jev/recommend";
import { processTrainQueue, recoverStaleTrain } from "./train/runner";
import { collectDocker } from "./spark/collectors/docker";
import { collectHealth } from "./spark/collectors/health";
import { collectOllama } from "./spark/collectors/ollama";
import { collectOs, collectSecurity, collectUpdates } from "./spark/collectors/system";
import { collectVllm } from "./vllm/collector";
import { listServers, type ServerRef } from "./executor";

const S = 1000;
const M = 60 * S;
const H = 60 * M;

export interface JobState {
  name: string;
  label: string;
  intervalMs: number;
  lastRun: number | null;
  lastMs: number | null;
  lastError: string | null;
  running: boolean;
}

function retention(): void {
  const db = getDb();
  const week = Date.now() - 7 * 24 * H;
  // Depois de 7 dias fica uma amostra por hora POR SERVIDOR (a primeira de cada hora).
  db.run(
    sql`delete from metrics where ts < ${week} and id not in (
      select min(id) from metrics where ts < ${week} group by server_id, ts / 3600000
    )`,
  );
  db.delete(schema.containerStats).where(lt(schema.containerStats.ts, week)).run();
  db.delete(schema.events).where(lt(schema.events.ts, Date.now() - 90 * 24 * H)).run();
}

async function audit(): Promise<void> {
  await runAuditor();
  rebuildRecommendations();
}

/**
 * Etapa 03: os jobs de monitoração iteram sobre o registro `servers`
 * (não mais sobre um servidor constante): cada servidor cadastrado é
 * coletado pelo driver dele, em paralelo.
 */
async function eachServer<T>(fn: (server: ServerRef) => Promise<T>): Promise<void> {
  const servers = listServers();
  await Promise.all(servers.map((server) => fn(server)));
}

const JOBS: { name: string; label: string; intervalMs: number; fn: () => Promise<unknown> | unknown }[] = [
  { name: "ollama", label: "Ollama (modelos, carregados)", intervalMs: 30 * S, fn: () => eachServer((s) => collectOllama(s)) },
  { name: "vllm", label: "vLLM (modelos, status, métricas)", intervalMs: 15 * S, fn: () => eachServer((s) => collectVllm(s)) },
  { name: "health", label: "Saúde (GPU, memória, CPU, disco)", intervalMs: 15 * S, fn: () => eachServer((s) => collectHealth(s)) },
  { name: "docker", label: "Containers", intervalMs: 60 * S, fn: () => eachServer((s) => collectDocker(s)) },
  { name: "delegations", label: "Delegações (runs.jsonl)", intervalMs: 30 * S, fn: ingestDelegateRuns },
  { name: "security", label: "Segurança", intervalMs: 15 * M, fn: () => eachServer((s) => collectSecurity(s)) },
  { name: "os", label: "SO e runtimes", intervalMs: 6 * H, fn: () => eachServer((s) => collectOs(s)) },
  { name: "updates", label: "Updates (apt)", intervalMs: 6 * H, fn: () => eachServer((s) => collectUpdates(s)) },
  { name: "claude", label: "Tokens do Claude (transcripts)", intervalMs: 5 * M, fn: ingestClaudeUsage },
  { name: "auditor", label: "Auditor Jev + recomendações", intervalMs: 5 * M, fn: audit },
  { name: "bench", label: "Fila de benchmarks", intervalMs: 5 * S, fn: processBenchQueue },
  { name: "train", label: "Fila de treinos", intervalMs: 5 * S, fn: processTrainQueue },
  { name: "retention", label: "Retenção de métricas", intervalMs: 1 * H, fn: retention },
];

const g = globalThis as unknown as { __icewallJobs?: Map<string, JobState> };

export function jobStates(): JobState[] {
  return [...(g.__icewallJobs?.values() ?? [])];
}

/** "Verificar agora": relê o estado dos servidores (que muda quando alguém aplica uma recomendação) e só então audita. */
export async function recheck(): Promise<void> {
  await Promise.all([runJob("security"), runJob("updates"), runJob("os")]);
  await runJob("auditor");
}

export async function runJob(name: string): Promise<void> {
  const job = JOBS.find((j) => j.name === name);
  const state = g.__icewallJobs?.get(name);
  if (!job || !state || state.running) return;
  state.running = true;
  const started = Date.now();
  try {
    await job.fn();
    state.lastError = null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    console.error(`[icewall] job ${name}:`, err);
  } finally {
    state.running = false;
    state.lastRun = Date.now();
    state.lastMs = Date.now() - started;
  }
}

/** Sobe os jobs uma vez por processo (sobrevive ao HMR do next dev). */
export function startScheduler(): void {
  if (g.__icewallJobs) return;
  g.__icewallJobs = new Map(
    JOBS.map((j) => [j.name, { name: j.name, label: j.label, intervalMs: j.intervalMs, lastRun: null, lastMs: null, lastError: null, running: false }]),
  );
  recoverStaleBench();
  recoverStaleTrain();
  for (const j of JOBS) setInterval(() => void runJob(j.name), j.intervalMs).unref();
  void (async () => {
    // health e security leem os snapshots de ollama e docker: esses dois primeiro, o resto em paralelo, o auditor por último.
    await Promise.all([runJob("ollama"), runJob("docker")]);
    const first = new Set(["ollama", "docker", "auditor"]);
    await Promise.all(JOBS.filter((j) => !first.has(j.name)).map((j) => runJob(j.name)));
    await runJob("auditor"); // depois de tudo: as recomendações dependem dos snapshots
  })();
}

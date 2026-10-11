import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { OllamaSnapshot } from "@/lib/types";
import { getDb, schema } from "../db/client";
import { DELEGATE_BIN } from "../lib/paths";
import { addEvent, getSnapshot } from "../lib/store";
import { ollamaGpuBytes } from "../spark/collectors/health";
import { ollamaFetch } from "../spark/collectors/ollama";
import { parseComputeApps } from "../parsers";
import { sparkExec } from "../spark/ssh";
import { cenariosAplicaveis, lerCombinacoes } from "./spark";
import { enviarBancada, executarCombinacao, prepararSpark, restaurarSpark } from "./spark-run";
import { listTasks, PERF_SIZES, stageTask, type TaskMeta } from "./tasks";


const DELEGATE_LOCK = path.join(os.homedir(), ".cache/delegate-local/lock");
const PERF_CTX = 40960;
const PERF_PREDICT = 256;

type BenchRun = typeof schema.benchRuns.$inferSelect;

const g = globalThis as unknown as { __icewallBenchBusy?: boolean };

function progress(id: number, set: Partial<typeof schema.benchRuns.$inferInsert>) {
  getDb().update(schema.benchRuns).set(set).where(eq(schema.benchRuns.id, id)).run();
}

function cancelled(id: number): boolean {
  return getDb().select({ s: schema.benchRuns.status }).from(schema.benchRuns).where(eq(schema.benchRuns.id, id)).get()?.s === "cancelled";
}

// ---------- performance ----------

const SNIPPET = `export function handle(req, res) {
  const { id, filter } = req.query;
  const items = store.list(filter).filter((x) => x.owner === id).map((x) => ({ ...x, seen: true }));
  if (!items.length) return res.status(404).json({ error: "not found" });
  return res.json({ count: items.length, items });
}
`;

/** Prompt de ~N tokens (≈ 3,5 caracteres/token), com um nonce no início para não reaproveitar o cache de prefixo. */
function perfPrompt(tokens: number): string {
  const body = SNIPPET.repeat(Math.ceil((tokens * 3.5) / SNIPPET.length)).slice(0, Math.floor(tokens * 3.5));
  return `Run ${Date.now()}-${Math.random()}\n\n${body}\n\nSummarize what this code does in three sentences.`;
}

interface GenStats {
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

async function generate(model: string, prompt: string, think: boolean | undefined, numPredict = PERF_PREDICT): Promise<GenStats> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
    keep_alive: "2m",
    options: { num_ctx: PERF_CTX, num_predict: numPredict, temperature: 0 },
  };
  if (think !== undefined) body.think = think;
  return (await ollamaFetch("/api/generate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }, 600_000)) as GenStats;
}

async function unload(model: string) {
  await ollamaFetch("/api/generate", { method: "POST", body: JSON.stringify({ model, keep_alive: 0 }), headers: { "content-type": "application/json" } }).catch(() => null);
}

/** Memória do modelo medida pelo nvidia-smi (o /api/ps subestima alguns modelos). Só ele está carregado durante a medição. */
async function loadedVram(model: string): Promise<number | null> {
  const res = await sparkExec("nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits");
  if (res.code === 0) {
    const bytes = ollamaGpuBytes(parseComputeApps(res.stdout));
    if (bytes > 0) return bytes;
  }
  const ps = (await ollamaFetch("/api/ps").catch(() => null)) as { models?: { name: string; size_vram?: number }[] } | null;
  return ps?.models?.find((m) => m.name === model)?.size_vram ?? null;
}

/**
 * Segura o lock do delegate-local (o mesmo flock do script Python) enquanto `fn` roda:
 * a medição não disputa o Spark com uma delegação, e nenhuma delegação começa no meio dela.
 */
async function withDelegateLock<T>(fn: () => Promise<T>, maxSeconds = 7200): Promise<T> {
  fs.mkdirSync(path.dirname(DELEGATE_LOCK), { recursive: true });
  const holder = spawn("flock", ["-w", "900", DELEGATE_LOCK, "-c", `echo LOCKED; exec sleep ${Math.floor(maxSeconds)}`], {
    stdio: ["ignore", "pipe", "ignore"],
    detached: true, // grupo próprio: o sleep herda o descritor do lock e precisa morrer junto
  });
  await new Promise<void>((resolve, reject) => {
    holder.stdout.on("data", (d: Buffer) => d.toString().includes("LOCKED") && resolve());
    holder.on("close", () => reject(new Error("não consegui o lock do delegate-local em 15 min")));
  });
  try {
    return await fn();
  } finally {
    try {
      process.kill(-holder.pid!, "SIGTERM");
    } catch {
      holder.kill("SIGTERM");
    }
  }
}

async function perfModel(run: BenchRun, model: string, sample: number, onItem: (label: string) => void) {
  return withDelegateLock(() => perfModelLocked(run, model, sample, onItem));
}

async function perfModelLocked(run: BenchRun, model: string, sample: number, onItem: (label: string) => void) {
  const db = getDb();
  const info = getSnapshot<OllamaSnapshot>("ollama")?.data?.models.find((m) => m.name === model);
  const think = info?.capabilities.includes("thinking") ? false : undefined;
  const loaded = getSnapshot<OllamaSnapshot>("ollama")?.data?.loaded ?? [];
  for (const m of loaded) await unload(m.name);

  onItem(`${model} · carga a frio`);
  try {
    const cold = await generate(model, "Reply with OK.", think, 8);
    db.insert(schema.benchResults)
      .values({ benchRunId: run.id, model, task: "perf:load", sample, ok: true, loadMs: (cold.load_duration ?? 0) / 1e6, durationS: (cold.total_duration ?? 0) / 1e9 })
      .run();
  } catch (err) {
    db.insert(schema.benchResults).values({ benchRunId: run.id, model, task: "perf:load", sample, ok: false, error: String(err) }).run();
    return;
  }
  for (const [task, tokens] of Object.entries(PERF_SIZES)) {
    if (cancelled(run.id)) return;
    onItem(`${model} · ${task.replace("perf:", "")} tokens`);
    try {
      const s = await generate(model, perfPrompt(tokens), think);
      const promptS = (s.prompt_eval_duration ?? 0) / 1e9;
      const evalS = (s.eval_duration ?? 0) / 1e9;
      db.insert(schema.benchResults)
        .values({
          benchRunId: run.id,
          model,
          task,
          sample,
          ok: true,
          promptTokens: s.prompt_eval_count ?? null,
          evalTokens: s.eval_count ?? null,
          promptTokS: promptS ? (s.prompt_eval_count ?? 0) / promptS : null,
          tokS: evalS ? (s.eval_count ?? 0) / evalS : null,
          ttftMs: ((s.load_duration ?? 0) + (s.prompt_eval_duration ?? 0)) / 1e6,
          loadMs: (s.load_duration ?? 0) / 1e6,
          durationS: (s.total_duration ?? 0) / 1e9,
          sizeVram: await loadedVram(model),
        })
        .run();
    } catch (err) {
      db.insert(schema.benchResults).values({ benchRunId: run.id, model, task, sample, ok: false, error: String(err) }).run();
    }
  }
  await unload(model);
}

// ---------- qualidade (pipeline real do delegate-local) ----------

interface DelegateOutput {
  run_id?: string;
  exit_code?: number;
  rounds?: number;
  tests_passed?: boolean | null;
  tok_s?: number;
  tokens?: number;
}

function runDelegate(args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(DELEGATE_BIN, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err) });
    });
  });
}

async function qualityTask(run: BenchRun, model: string, task: TaskMeta, sample: number) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `icewall-bench-${task.id}-`));
  try {
    stageTask(task, work);
    const args = [
      "run", "--tier", "fast", "--model", model, "--label", "bench",
      "--task", "spec.md", "--context", ...task.context,
      "--workdir", ".", "--test-cmd", `node --test ${task.test}`,
      "--max-rounds", "3", "--out", path.join(work, ".out"),
    ];
    if (task.singleFile) args.push("--single-file", task.singleFile);
    const started = Date.now();
    const res = await runDelegate(args, work, 30 * 60_000);
    let out: DelegateOutput = {};
    try {
      out = JSON.parse(res.stdout) as DelegateOutput;
    } catch {
      out = { exit_code: res.code };
    }
    const ok = out.exit_code === 0 && out.tests_passed === true;
    getDb()
      .insert(schema.benchResults)
      .values({
        benchRunId: run.id,
        model,
        task: task.id,
        sample,
        ok,
        firstTry: ok && out.rounds === 1,
        rounds: out.rounds ?? null,
        exitCode: out.exit_code ?? res.code,
        durationS: (Date.now() - started) / 1000,
        tokS: out.tok_s ?? null,
        evalTokens: out.tokens ?? null,
        delegateRunId: out.run_id ?? null,
        error: ok ? null : res.stderr.trim().slice(-1000) || null,
      })
      .run();
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ---------- fila ----------

// ---------- bancada do Spark (vLLM) ----------

async function executeSpark(run: BenchRun) {
  const combs = lerCombinacoes().filter((c) => run.models.includes(c.id));
  const total = 1 + run.samples * combs.reduce((n, c) => n + 1 + cenariosAplicaveis(c, run.tasks).length, 0);
  progress(run.id, { status: "running", total, done: 0 });
  let done = 0;
  const step = (label: string) => {
    progress(run.id, { current: label, done });
    done++;
  };
  // O Ollama fica parado durante a rodada: o lock impede que uma delegação comece no meio.
  await withDelegateLock(async () => {
    step("copiando a bancada para o Spark");
    await enviarBancada();
    const ollamaEstava = await prepararSpark();
    try {
      for (let sample = 1; sample <= run.samples; sample++) {
        for (const comb of combs) {
          if (cancelled(run.id)) return;
          await executarCombinacao(run, comb, sample, step, () => cancelled(run.id));
        }
      }
    } finally {
      await restaurarSpark(ollamaEstava);
    }
  }, 12 * 3600);
  if (cancelled(run.id)) return;
  progress(run.id, { status: "done", done: total, current: null, finishedAt: Date.now() });
  addEvent("bench", "info", `Bancada do Spark #${run.id} concluída`, { combinacoes: run.models });
}

async function execute(run: BenchRun) {
  if (run.kind === "spark") return executeSpark(run);
  const tasks = run.kind === "quality" ? listTasks().filter((t) => run.tasks.includes(t.id)) : [];
  const total = run.kind === "quality" ? run.models.length * tasks.length * run.samples : run.models.length * run.samples * (1 + Object.keys(PERF_SIZES).length);
  progress(run.id, { status: "running", total, done: 0 });
  let done = 0;
  const step = (label: string) => {
    progress(run.id, { current: label, done });
    done++;
  };
  for (let sample = 1; sample <= run.samples; sample++) {
    for (const model of run.models) {
      if (cancelled(run.id)) return;
      if (run.kind === "perf") {
        await perfModel(run, model, sample, step);
      } else {
        for (const task of tasks) {
          if (cancelled(run.id)) return;
          step(`${model} · ${task.id} · amostra ${sample}`);
          await qualityTask(run, model, task, sample);
        }
      }
    }
  }
  progress(run.id, { status: "done", done: total, current: null, finishedAt: Date.now() });
  addEvent("bench", "info", `Benchmark #${run.id} (${run.kind}) concluído`, { models: run.models });
}

/** Chamado pelo agendador: executa o próximo benchmark da fila, um por vez. */
export async function processBenchQueue(): Promise<void> {
  if (g.__icewallBenchBusy) return;
  const next = getDb().select().from(schema.benchRuns).where(eq(schema.benchRuns.status, "queued")).orderBy(schema.benchRuns.id).get();
  if (!next) return;
  g.__icewallBenchBusy = true;
  try {
    await execute(next);
  } catch (err) {
    progress(next.id, { status: "failed", error: String(err), finishedAt: Date.now() });
  } finally {
    g.__icewallBenchBusy = false;
  }
}

/** Benchmarks que ficaram "running" quando o servidor caiu não vão terminar: marca como falhos. */
export function recoverStaleBench(): void {
  getDb()
    .update(schema.benchRuns)
    .set({ status: "failed", error: "servidor reiniciado durante a execução", finishedAt: Date.now() })
    .where(eq(schema.benchRuns.status, "running"))
    .run();
}

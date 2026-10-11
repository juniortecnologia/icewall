import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

/** Série temporal de saúde do Spark (coletor de 15 s). Memória unificada: GPU e CPU dividem a RAM. */
export const metrics = sqliteTable(
  "metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull(),
    gpuUtil: real("gpu_util"),
    gpuTemp: real("gpu_temp"),
    gpuPower: real("gpu_power"),
    gpuClock: real("gpu_clock"),
    gpuProcMem: real("gpu_proc_mem"), // MiB somados de --query-compute-apps
    memTotal: real("mem_total"),
    memAvailable: real("mem_available"),
    swapTotal: real("swap_total"),
    swapFree: real("swap_free"),
    load1: real("load1"),
    load5: real("load5"),
    load15: real("load15"),
    cpuCount: integer("cpu_count"),
    diskTotal: real("disk_total"),
    diskUsed: real("disk_used"),
    ollamaVram: real("ollama_vram"),
  },
  (t) => [index("metrics_ts").on(t.ts)],
);

export const containerStats = sqliteTable(
  "container_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull(),
    name: text("name").notNull(),
    cpuPct: real("cpu_pct"),
    memBytes: real("mem_bytes"),
  },
  (t) => [index("container_stats_ts").on(t.ts)],
);

/** Último estado conhecido de cada fonte (ollama_tags, containers, os, upgradable, ports...). */
export const snapshots = sqliteTable("snapshots", {
  key: text("key").primaryKey(),
  ts: integer("ts").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  error: text("error"),
});

/** Mudanças detectadas entre coletas (modelo novo, container parou, porta nova...). */
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull().default(now),
    kind: text("kind").notNull(),
    severity: text("severity", { enum: ["info", "warn", "crit"] }).notNull().default("info"),
    title: text("title").notNull(),
    detail: text("detail", { mode: "json" }),
  },
  (t) => [index("events_ts").on(t.ts)],
);

export const delegateRuns = sqliteTable(
  "delegate_runs",
  {
    runId: text("run_id").primaryKey(),
    ts: integer("ts").notNull(),
    workdir: text("workdir"),
    project: text("project"),
    label: text("label"),
    tier: text("tier"),
    model: text("model"),
    fallbackUsed: integer("fallback_used", { mode: "boolean" }),
    exitCode: integer("exit_code").notNull(),
    rounds: integer("rounds"),
    maxRounds: integer("max_rounds"),
    testsPassed: integer("tests_passed", { mode: "boolean" }),
    evalTokens: integer("eval_tokens"),
    promptTokens: integer("prompt_tokens"),
    tokS: real("tok_s"),
    durationS: real("duration_s"),
    testCmd: text("test_cmd"),
    contextCount: integer("context_count"),
    taskSha: text("task_sha"),
    taskChars: integer("task_chars"),
    taskExcerpt: text("task_excerpt"),
    files: text("files", { mode: "json" }).$type<string[]>(),
    warnings: text("warnings", { mode: "json" }).$type<string[]>(),
    message: text("message"),
  },
  (t) => [index("delegate_runs_ts").on(t.ts)],
);

export const delegateReviews = sqliteTable("delegate_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  ts: integer("ts").notNull(),
  verdict: text("verdict", { enum: ["accepted", "fixed", "rejected"] }).notNull(),
  reason: text("reason"),
});

/** Uma linha por resposta do Claude (dedup pelo id da mensagem; o transcript repete o usage por bloco). */
export const claudeUsage = sqliteTable(
  "claude_usage",
  {
    messageId: text("message_id").primaryKey(),
    ts: integer("ts").notNull(),
    sessionId: text("session_id"),
    project: text("project"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheRead: integer("cache_read").notNull().default(0),
    cacheCreation: integer("cache_creation").notNull().default(0),
    thinkingTokens: integer("thinking_tokens").notNull().default(0),
    sidechain: integer("sidechain", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("claude_usage_ts").on(t.ts)],
);

/** Até onde cada arquivo JSONL já foi lido. */
export const ingestOffsets = sqliteTable("ingest_offsets", {
  file: text("file").primaryKey(),
  offset: integer("offset").notNull(),
  size: integer("size").notNull(),
});

export const benchRuns = sqliteTable("bench_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull().default(now),
  finishedAt: integer("finished_at"),
  kind: text("kind", { enum: ["perf", "quality", "spark"] }).notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed", "cancelled"] }).notNull(),
  models: text("models", { mode: "json" }).$type<string[]>().notNull(),
  tasks: text("tasks", { mode: "json" }).$type<string[]>().notNull(),
  samples: integer("samples").notNull().default(1),
  total: integer("total").notNull().default(0),
  done: integer("done").notNull().default(0),
  current: text("current"),
  error: text("error"),
});

export const benchResults = sqliteTable(
  "bench_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    benchRunId: integer("bench_run_id").notNull(),
    ts: integer("ts").notNull().default(now),
    model: text("model").notNull(),
    task: text("task").notNull(),
    sample: integer("sample").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    firstTry: integer("first_try", { mode: "boolean" }),
    rounds: integer("rounds"),
    exitCode: integer("exit_code"),
    durationS: real("duration_s"),
    tokS: real("tok_s"),
    promptTokS: real("prompt_tok_s"),
    ttftMs: real("ttft_ms"),
    loadMs: real("load_ms"),
    promptTokens: integer("prompt_tokens"),
    evalTokens: integer("eval_tokens"),
    sizeVram: real("size_vram"),
    delegateRunId: text("delegate_run_id"),
    /** Bancada do Spark: o JSON que o script imprimiu (carga, RAG, imagem…), mais a memória mínima. */
    metricas: text("metricas", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (t) => [index("bench_results_run").on(t.benchRunId)],
);

/** Cada requisição à Jev: estado + perguntas (hash) e respostas tipadas. O hash evita pagar duas vezes. */
export const jevJudgments = sqliteTable(
  "jev_judgments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull().default(now),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    requestHash: text("request_hash").notNull(),
    model: text("model"),
    answers: text("answers", { mode: "json" }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("jev_request_hash").on(t.requestHash),
    index("jev_subject").on(t.subjectKind, t.subjectId),
  ],
);

export const recommendations = sqliteTable("recommendations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(), // estável: a mesma situação atualiza em vez de duplicar
  ts: integer("ts").notNull(),
  area: text("area", { enum: ["delegation", "models", "os", "security", "tokens", "containers"] }).notNull(),
  severity: text("severity", { enum: ["info", "warn", "crit"] }).notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  action: text("action"), // comando ou diff sugerido (nunca aplicado sozinho)
  confidence: real("confidence"),
  evidence: text("evidence", { mode: "json" }),
  status: text("status", { enum: ["open", "dismissed", "done"] }).notNull().default("open"),
});

export const actionLog = sqliteTable("action_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull().default(now),
  action: text("action").notNull(),
  target: text("target"),
  status: text("status", { enum: ["ok", "error"] }).notNull(),
  output: text("output"),
  durationMs: integer("duration_ms"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

// ---------------------------------------------------------------------------------------------
// Crivo: os dois portões do Claude Code (ganchos UserPromptSubmit e PreToolUse).
// Vieram do crivo.db v4; os horários passaram de ISO para ms, como o resto do ICEWALL.

/** Portão de entrada: cada prompt, a decisão e as chances da Jev em 0–100. */
export const crivoPrompts = sqliteTable(
  "crivo_prompts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull(),
    texto: text("texto").notNull(),
    /** Última pasta do cwd do Claude Code. */
    origem: text("origem").notNull(),
    sessao: text("sessao"),
    tamanho: text("tamanho", { enum: ["ajuste", "funcionalidade", "sistema"] }),
    tamanhoPct: integer("tamanho_pct"),
    objetivoPct: integer("objetivo_pct"),
    ondePct: integer("onde_pct"),
    prontoPct: integer("pronto_pct"),
    focoPct: integer("foco_pct"),
    nota: integer("nota"),
    semaforo: text("semaforo", { enum: ["verde", "amarelo", "vermelho"] }).notNull(),
    /** Nulo = registrado antes da avaliação com a Jev (etapa 2 do Crivo). */
    avaliacao: text("avaliacao", { enum: ["jev", "pressa", "curta", "resposta", "notificacao", "falhou"] }),
    duracaoMs: integer("duracao_ms"),
    faltando: text("faltando", { mode: "json" }).$type<("objetivo" | "onde" | "pronto" | "mistura")[]>(),
    motivo: text("motivo"),
    jevInputTokens: integer("jev_input_tokens"),
    jevOutputTokens: integer("jev_output_tokens"),
  },
  (t) => [index("crivo_prompts_ts").on(t.ts), index("crivo_prompts_sessao").on(t.sessao, t.id)],
);

/** Portão de saída: cada comando ou arquivo que o Claude vai mexer. */
export const crivoComandos = sqliteTable(
  "crivo_comandos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull(),
    origem: text("origem").notNull(),
    sessao: text("sessao"),
    tipo: text("tipo", { enum: ["comando", "arquivo"] }).notNull(),
    alvo: text("alvo").notNull(),
    /** Regra da casa em que bateu; nulo = liberado. */
    regra: text("regra"),
    semaforo: text("semaforo", { enum: ["liberado", "segurado"] }).notNull(),
  },
  (t) => [index("crivo_comandos_ts").on(t.ts)],
);

/** Projetos vistos pelos ganchos (a chave é a última pasta do cwd). Descrição à mão e liga/desliga ficam aqui. */
export const crivoProjetos = sqliteTable("crivo_projetos", {
  origem: text("origem").primaryKey(),
  /** cwd completo do último gancho: é onde o ICEWALL procura o README. */
  cwd: text("cwd").notNull(),
  /** Escrita na aba; nulo = automática (README ou nome da pasta). */
  descricao: text("descricao"),
  desligado: integer("desligado", { mode: "boolean" }).notNull().default(false),
  vistoEm: integer("visto_em").notNull(),
});

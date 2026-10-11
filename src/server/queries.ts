import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type {
  DockerSnapshot,
  HealthSnapshot,
  OllamaSnapshot,
  OsSnapshot,
  SecuritySnapshot,
  UpdatesSnapshot,
} from "@/lib/types";
import { benchRows, benchWeights, readModelsJson } from "./bench/models-json";
import { leaderboard } from "./bench/leaderboard";
import { listTasks } from "./bench/tasks";
import { getDb, schema } from "./db/client";
import { jevEnabled, JEV_MODEL } from "./jev/client";
import { answersByKind } from "./jev/recommend";
import { isSuccess, type AnswerMap } from "./jev/rules";
import { custoJev } from "./crivo/store";
import { getSnapshot, recentEvents } from "./lib/store";
import { jobStates } from "./scheduler";

const DAY = 86_400_000;

export function overview() {
  const db = getDb();
  const health = getSnapshot<HealthSnapshot>("health");
  const ollama = getSnapshot<OllamaSnapshot>("ollama");
  const docker = getSnapshot<DockerSnapshot>("docker");
  const updates = getSnapshot<UpdatesSnapshot>("updates");
  const security = getSnapshot<SecuritySnapshot>("security");
  const since = Date.now() - 7 * DAY;
  const runs = db
    .select({ exitCode: schema.delegateRuns.exitCode, runId: schema.delegateRuns.runId, evalTokens: schema.delegateRuns.evalTokens })
    .from(schema.delegateRuns)
    .where(and(gte(schema.delegateRuns.ts, since), sql`coalesce(${schema.delegateRuns.label}, '') != 'bench'`))
    .all();
  const verdicts = verdictMap();
  const ok = runs.filter((r) => isSuccess({ exitCode: r.exitCode, verdict: verdicts.get(r.runId) ?? null })).length;
  const recs = db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.status, "open"))
    .orderBy(sql`case ${schema.recommendations.severity} when 'crit' then 0 when 'warn' then 1 else 2 end`, desc(schema.recommendations.ts))
    .all();
  return {
    health,
    ollama: ollama && { ts: ollama.ts, error: ollama.error, version: ollama.data?.version ?? null, models: ollama.data?.models.length ?? 0, loaded: ollama.data?.loaded ?? [] },
    docker: docker && {
      ts: docker.ts,
      error: docker.error,
      running: docker.data?.containers.filter((c) => c.state === "running").length ?? 0,
      total: docker.data?.containers.length ?? 0,
      containers: docker.data?.containers ?? [],
    },
    updates: updates && {
      ts: updates.ts,
      total: updates.data?.packages.length ?? 0,
      security: updates.data?.packages.filter((p) => p.security).length ?? 0,
      rebootRequired: updates.data?.rebootRequired ?? false,
    },
    security: security && { ts: security.ts, findings: security.data?.findings ?? [] },
    delegations: { total: runs.length, ok, localTokens: runs.reduce((a, r) => a + (r.evalTokens ?? 0), 0) },
    recommendations: recs,
    events: recentEvents(25),
    jobs: jobStates(),
    jev: { enabled: jevEnabled(), model: JEV_MODEL },
  };
}

const RANGES: Record<string, number> = { "1h": 3_600_000, "6h": 6 * 3_600_000, "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY };

/** Série temporal com no máximo ~240 pontos (média por balde). */
export function metricSeries(range: string) {
  const span = RANGES[range] ?? RANGES["6h"];
  const since = Date.now() - span;
  const bucket = Math.max(15_000, Math.floor(span / 240));
  const m = schema.metrics;
  return getDb()
    .select({
      ts: sql<number>`min(${m.ts})`,
      gpuUtil: sql<number>`avg(${m.gpuUtil})`,
      gpuTemp: sql<number>`avg(${m.gpuTemp})`,
      gpuPower: sql<number>`avg(${m.gpuPower})`,
      memUsed: sql<number>`avg(${m.memTotal} - ${m.memAvailable})`,
      memTotal: sql<number>`max(${m.memTotal})`,
      swapUsed: sql<number>`avg(${m.swapTotal} - ${m.swapFree})`,
      load1: sql<number>`avg(${m.load1})`,
      cpuCount: sql<number>`max(${m.cpuCount})`,
      ollamaVram: sql<number>`avg(${m.ollamaVram})`,
    })
    .from(m)
    .where(gte(m.ts, since))
    .groupBy(sql`${m.ts} / ${bucket}`)
    .orderBy(sql`min(${m.ts})`)
    .all();
}

function verdictMap() {
  const reviews = getDb().select().from(schema.delegateReviews).orderBy(schema.delegateReviews.ts).all();
  return new Map(reviews.map((r) => [r.runId, r.verdict]));
}

function reviewReasons() {
  const reviews = getDb().select().from(schema.delegateReviews).orderBy(schema.delegateReviews.ts).all();
  return new Map(reviews.map((r) => [r.runId, r.reason]));
}

function choiceOf(a: AnswerMap | undefined, key: string): { choice: string; confidence: number } | null {
  const v = a?.[key];
  return v?.type === "choice" ? { choice: v.choice, confidence: v.confidence } : null;
}

export function delegations(days: number, includeBench: boolean) {
  const db = getDb();
  const since = Date.now() - days * DAY;
  const runs = db
    .select()
    .from(schema.delegateRuns)
    .where(
      and(
        gte(schema.delegateRuns.ts, since),
        includeBench ? sql`1 = 1` : sql`coalesce(${schema.delegateRuns.label}, '') != 'bench'`,
      ),
    )
    .orderBy(desc(schema.delegateRuns.ts))
    .all();
  const verdicts = verdictMap();
  const reasons = reviewReasons();
  const judged = answersByKind("delegation");
  const rows = runs.map((r) => {
    const a = judged.get(r.runId);
    const worth = a?.worth_delegating;
    return {
      ...r,
      verdict: verdicts.get(r.runId) ?? null,
      reason: reasons.get(r.runId) ?? null,
      success: isSuccess({ exitCode: r.exitCode, verdict: verdicts.get(r.runId) ?? null }),
      jev: a
        ? {
            failureCause: choiceOf(a, "failure_cause"),
            taskKind: choiceOf(a, "task_kind"),
            bestRoute: choiceOf(a, "best_route"),
            bottleneck: choiceOf(a, "bottleneck"),
            worth: worth?.type === "noul" ? worth.noul : null,
          }
        : null,
    };
  });

  const group = (key: (r: (typeof rows)[number]) => string | null | undefined) => {
    const map = new Map<string, { key: string; n: number; ok: number; rounds: number[]; tokS: number[]; dur: number[]; firstTry: number }>();
    for (const r of rows) {
      const k = key(r);
      if (!k) continue;
      const g = map.get(k) ?? { key: k, n: 0, ok: 0, rounds: [], tokS: [], dur: [], firstTry: 0 };
      g.n++;
      if (r.success) g.ok++;
      if (r.success && r.rounds === 1) g.firstTry++;
      if (r.rounds) g.rounds.push(r.rounds);
      if (r.tokS) g.tokS.push(r.tokS);
      if (r.durationS) g.dur.push(r.durationS);
      map.set(k, g);
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return [...map.values()]
      .map((g) => ({ key: g.key, n: g.n, ok: g.ok, firstTry: g.firstTry, avgRounds: mean(g.rounds), avgTokS: mean(g.tokS), avgDuration: mean(g.dur) }))
      .sort((a, b) => b.n - a.n);
  };
  const count = (pick: (r: (typeof rows)[number]) => string | null | undefined) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  };
  return {
    runs: rows,
    byModel: group((r) => r.model),
    byTier: group((r) => r.tier),
    byKind: group((r) => r.jev?.taskKind?.choice),
    byProject: group((r) => r.project),
    failureCauses: count((r) => (r.jev?.failureCause?.choice !== "none" ? r.jev?.failureCause?.choice : null) ?? (r.exitCode >= 2 && r.exitCode <= 4 ? "infrastructure" : null)),
    bottlenecks: count((r) => r.jev?.bottleneck?.choice),
    exitCodes: count((r) => String(r.exitCode)),
    verdicts: count((r) => r.verdict ?? "sem veredito"),
  };
}

export function tokens(days: number) {
  const db = getDb();
  const since = Date.now() - days * DAY;
  const u = schema.claudeUsage;
  const day = sql<string>`strftime('%Y-%m-%d', ${u.ts} / 1000, 'unixepoch', 'localtime')`;
  const sums = {
    input: sql<number>`sum(${u.inputTokens})`,
    output: sql<number>`sum(${u.outputTokens})`,
    cacheRead: sql<number>`sum(${u.cacheRead})`,
    cacheCreation: sql<number>`sum(${u.cacheCreation})`,
    thinking: sql<number>`sum(${u.thinkingTokens})`,
    messages: sql<number>`count(*)`,
  };
  const daily = db.select({ day, ...sums }).from(u).where(gte(u.ts, since)).groupBy(day).orderBy(day).all();
  const byModel = db.select({ model: u.model, ...sums }).from(u).where(gte(u.ts, since)).groupBy(u.model).orderBy(sql`sum(${u.outputTokens}) desc`).all();
  const byProject = db.select({ project: u.project, ...sums }).from(u).where(gte(u.ts, since)).groupBy(u.project).orderBy(sql`sum(${u.outputTokens}) desc`).limit(15).all();
  const sessions = db.select({ n: sql<number>`count(distinct ${u.sessionId})` }).from(u).where(gte(u.ts, since)).get()?.n ?? 0;
  const sidechain = db.select({ output: sql<number>`coalesce(sum(${u.outputTokens}), 0)` }).from(u).where(and(gte(u.ts, since), eq(u.sidechain, true))).get()?.output ?? 0;
  const r = schema.delegateRuns;
  const rday = sql<string>`strftime('%Y-%m-%d', ${r.ts} / 1000, 'unixepoch', 'localtime')`;
  const delegatedDaily = db
    .select({ day: rday, evalTokens: sql<number>`coalesce(sum(${r.evalTokens}), 0)`, runs: sql<number>`count(*)` })
    .from(r)
    .where(and(gte(r.ts, since), eq(r.exitCode, 0), sql`coalesce(${r.label}, '') != 'bench'`))
    .groupBy(rday)
    .all();
  return { days, daily, byModel, byProject, sessions, sidechainOutput: sidechain, delegatedDaily };
}

export function system() {
  const pkgJudged = answersByKind("package");
  const portJudged = answersByKind("port");
  const updates = getSnapshot<UpdatesSnapshot>("updates");
  const security = getSnapshot<SecuritySnapshot>("security");
  return {
    os: getSnapshot<OsSnapshot>("os"),
    ollamaVersion: getSnapshot<OllamaSnapshot>("ollama")?.data?.version ?? null,
    updates: updates && {
      ...updates,
      data: updates.data && {
        ...updates.data,
        packages: updates.data.packages.map((p) => {
          const a = pkgJudged.get(`${p.name}=${p.version}`);
          return {
            ...p,
            jev: a
              ? {
                  severity: a.severity?.type === "score" ? a.severity.score : null,
                  severityConfidence: a.severity?.type === "score" ? a.severity.confidence : null,
                  gpu: a.touches_gpu_stack?.type === "noul" ? a.touches_gpu_stack.noul : null,
                  restart: a.needs_restart?.type === "noul" ? a.needs_restart.noul : null,
                }
              : null,
          };
        }),
      },
    },
    security: security && {
      ...security,
      data: security.data && {
        ...security.data,
        ports: security.data.ports.map((p) => {
          const a = portJudged.get(`${p.port}:${p.service ?? "unknown"}`)?.risky_exposure;
          return { ...p, jevRisk: a?.type === "noul" ? a.noul : null };
        }),
      },
    },
  };
}

export function containers() {
  const docker = getSnapshot<DockerSnapshot>("docker");
  const since = Date.now() - 6 * 3_600_000;
  const c = schema.containerStats;
  const history = getDb()
    .select({ ts: c.ts, name: c.name, cpuPct: c.cpuPct, memBytes: c.memBytes })
    .from(c)
    .where(gte(c.ts, since))
    .orderBy(c.ts)
    .all();
  return { docker, history };
}

export function models() {
  const ollama = getSnapshot<OllamaSnapshot>("ollama");
  const cfg = readModelsJson();
  const tiers = Object.entries(cfg?.tiers ?? {}).map(([name, t]) => ({ name, model: t.model, fallback: t.fallback ?? [] }));
  const usage = getDb()
    .select({
      model: schema.delegateRuns.model,
      n: sql<number>`count(*)`,
      ok: sql<number>`sum(case when ${schema.delegateRuns.exitCode} = 0 then 1 else 0 end)`,
      tokS: sql<number>`avg(${schema.delegateRuns.tokS})`,
    })
    .from(schema.delegateRuns)
    .groupBy(schema.delegateRuns.model)
    .all();
  return { ollama, tiers, keepAlive: cfg?.keep_alive ?? null, usage, board: leaderboard(benchRows(), benchWeights()) };
}

export function bench() {
  const db = getDb();
  return {
    tasks: listTasks(),
    runs: db.select().from(schema.benchRuns).orderBy(desc(schema.benchRuns.id)).limit(30).all(),
    board: leaderboard(benchRows(), benchWeights()),
    weights: benchWeights(),
    models: getSnapshot<OllamaSnapshot>("ollama")?.data?.models.filter((m) => m.capabilities.includes("completion")).map((m) => m.name) ?? [],
    tiers: Object.entries(readModelsJson()?.tiers ?? {}).map(([name, t]) => ({ name, model: t.model })),
  };
}

export function benchResultsFor(runId: number) {
  return getDb().select().from(schema.benchResults).where(eq(schema.benchResults.benchRunId, runId)).orderBy(schema.benchResults.id).all();
}

export function auditor() {
  const db = getDb();
  const j = schema.jevJudgments;
  const totals = db
    .select({
      calls: sql<number>`sum(case when ${j.answers} is not null then 1 else 0 end)`,
      errors: sql<number>`sum(case when ${j.error} is not null then 1 else 0 end)`,
      input: sql<number>`coalesce(sum(${j.inputTokens}), 0)`,
      output: sql<number>`coalesce(sum(${j.outputTokens}), 0)`,
    })
    .from(j)
    .get();
  const byKind = db
    .select({ kind: j.subjectKind, n: sql<number>`count(*)`, input: sql<number>`coalesce(sum(${j.inputTokens}), 0)` })
    .from(j)
    .groupBy(j.subjectKind)
    .all();
  // O Crivo chama a Jev por conta própria (sem cache, no gancho do Claude Code): o custo entra aqui também.
  const crivo = custoJev();
  if (crivo.n) byKind.push({ kind: "prompt", n: crivo.n, input: crivo.entrada });
  return {
    jev: { enabled: jevEnabled(), model: JEV_MODEL },
    sparkCheckedAt: getSnapshot("security")?.ts ?? null,
    totals: totals && {
      ...totals,
      calls: (totals.calls ?? 0) + crivo.n,
      input: (totals.input ?? 0) + crivo.entrada,
      output: (totals.output ?? 0) + crivo.saida,
    },
    byKind,
    recommendations: db.select().from(schema.recommendations).orderBy(desc(schema.recommendations.ts)).limit(100).all(),
    judgments: db.select().from(j).orderBy(desc(j.ts)).limit(60).all(),
  };
}

export function actionLog() {
  return getDb().select().from(schema.actionLog).orderBy(desc(schema.actionLog.ts)).limit(200).all();
}

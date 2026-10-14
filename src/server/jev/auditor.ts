import "server-only";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { SecuritySnapshot, UpdatesSnapshot } from "@/lib/types";
import { getDb, schema } from "../db/client";
import { primarySnapshot } from "../lib/store";
import { isJudged, jevEnabled, judge } from "./client";
import { benchFailureQuestions, delegationQuestions, HOST_CONTEXT, packageQuestions, portQuestions } from "./questions";

export const EXIT_MEANING: Record<number, string> = {
  0: "success",
  2: "local model server or model unavailable",
  3: "context too large, refused before generation",
  4: "secret detected in the request, refused",
  5: "model did not return usable code",
  6: "tests still failing after all rounds",
};

/** Falhas de infraestrutura (2, 3, 4) têm causa conhecida pelo código: não gastam pergunta da Jev. */
const INFRA_EXITS = new Set([2, 3, 4]);
const MAX_CALLS_PER_CYCLE = 15;
const REVIEW_GRACE_MS = 30 * 60_000;

type Run = typeof schema.delegateRuns.$inferSelect;
type Review = typeof schema.delegateReviews.$inferSelect;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function latestReview(runId: string): Review | undefined {
  return getDb()
    .select()
    .from(schema.delegateReviews)
    .where(eq(schema.delegateReviews.runId, runId))
    .orderBy(desc(schema.delegateReviews.ts))
    .get();
}

function usualTokS(model: string | null): number | null {
  if (!model) return null;
  const rows = getDb()
    .select({ tokS: schema.delegateRuns.tokS })
    .from(schema.delegateRuns)
    .where(and(eq(schema.delegateRuns.model, model), isNotNull(schema.delegateRuns.tokS)))
    .orderBy(desc(schema.delegateRuns.ts))
    .limit(50)
    .all();
  return median(rows.map((r) => r.tokS ?? 0).filter((v) => v > 0));
}

export function delegationState(run: Run, review: Review | undefined) {
  const genSeconds = run.evalTokens && run.tokS ? Math.round((run.evalTokens / run.tokS) * 10) / 10 : null;
  return {
    task_excerpt: run.taskExcerpt ?? "(not recorded)",
    spec_tokens_est: Math.round((run.taskChars ?? 0) / 3.5),
    setup: {
      tier: run.tier,
      model: run.model,
      fallback_used: run.fallbackUsed,
      context_files: run.contextCount,
      has_tests: Boolean(run.testCmd),
      max_rounds: run.maxRounds,
    },
    outcome: {
      exit_code: run.exitCode,
      meaning: EXIT_MEANING[run.exitCode] ?? "unknown",
      rounds: run.rounds,
      tests_passed: run.testsPassed,
      eval_tokens: run.evalTokens,
      files: run.files,
      warnings: run.warnings,
      message_tail: run.message?.slice(-1500) ?? "",
    },
    review: review ? { verdict: review.verdict, reason: review.reason } : "no review recorded",
    timing: {
      wall_seconds: run.durationS,
      generation_seconds_est: genSeconds,
      prompt_tokens: run.promptTokens,
      tokens_per_second: run.tokS,
      usual_tokens_per_second_for_model: usualTokS(run.model),
    },
  };
}

async function auditDelegations(budget: number): Promise<number> {
  const since = Date.now() - 30 * 86_400_000;
  const runs = getDb()
    .select()
    .from(schema.delegateRuns)
    .where(gte(schema.delegateRuns.ts, since))
    .orderBy(desc(schema.delegateRuns.ts))
    .all();
  let calls = 0;
  for (const run of runs) {
    if (calls >= budget) break;
    if (INFRA_EXITS.has(run.exitCode) || isJudged("delegation", run.runId)) continue;
    const review = latestReview(run.runId);
    const isBench = run.label === "bench";
    if (isBench && run.exitCode === 0) continue; // sucesso no benchmark: nada a explicar
    if (!isBench && !review && Date.now() - run.ts < REVIEW_GRACE_MS) continue; // espera o veredito
    const state = delegationState(run, review);
    if (isBench) {
      await judge("delegation", run.runId, state, benchFailureQuestions);
    } else if (run.exitCode === 0 && review?.verdict === "accepted") {
      const { task_kind, best_route, worth_delegating, bottleneck } = delegationQuestions;
      await judge("delegation", run.runId, state, { task_kind, best_route, worth_delegating, bottleneck });
    } else {
      await judge("delegation", run.runId, state, delegationQuestions);
    }
    calls++;
  }
  return calls;
}

async function auditPackages(budget: number): Promise<number> {
  const updates = primarySnapshot<UpdatesSnapshot>("updates")?.data;
  let calls = 0;
  for (const p of updates?.packages ?? []) {
    if (calls >= budget) break;
    const id = `${p.name}=${p.version}`;
    if (isJudged("package", id)) continue;
    await judge(
      "package",
      id,
      { host: HOST_CONTEXT, package: { name: p.name, installed: p.from, candidate: p.version, suites: p.suites, security_suite: p.security } },
      packageQuestions,
    );
    calls++;
  }
  return calls;
}

async function auditPorts(budget: number): Promise<number> {
  const sec = primarySnapshot<SecuritySnapshot>("security")?.data;
  let calls = 0;
  for (const p of sec?.ports ?? []) {
    if (calls >= budget) break;
    if (p.scope !== "any") continue;
    const id = `${p.port}:${p.service ?? "unknown"}`;
    if (isJudged("port", id)) continue;
    await judge(
      "port",
      id,
      { host: HOST_CONTEXT, firewall_ufw: sec?.ufwActive ?? "unknown", listener: { port: p.port, addresses: p.addresses, service: p.service ?? "unknown" } },
      portQuestions,
    );
    calls++;
  }
  return calls;
}

export async function runAuditor(): Promise<{ enabled: boolean; calls: number }> {
  if (!jevEnabled()) return { enabled: false, calls: 0 };
  let calls = await auditDelegations(MAX_CALLS_PER_CYCLE);
  calls += await auditPorts(MAX_CALLS_PER_CYCLE - calls);
  calls += await auditPackages(MAX_CALLS_PER_CYCLE - calls);
  return { enabled: true, calls };
}

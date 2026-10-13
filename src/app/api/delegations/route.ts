import path from "node:path";
import { z } from "zod";
import { json } from "@/server/api";
import { getDb, schema } from "@/server/db/client";
import { delegations } from "@/server/queries";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return json(() => delegations(Math.min(Number(q.get("days")) || 30, 365), q.get("bench") === "1"));
}

// ── Zod schemas (must match delegate-runs.ts line schemas) ────────────────

const runEntry = z.object({
  type: z.literal("run"),
  run_id: z.string(),
  ts: z.string(),
  workdir: z.string().nullish(),
  label: z.string().nullish(),
  tier: z.string().nullish(),
  model: z.string().nullish(),
  exit_code: z.number().int(),
  duration_s: z.number().default(0),
  test_cmd: z.string().nullish(),
  context_count: z.number().nullish(),
  max_rounds: z.number().nullish(),
  task_sha256: z.string().nullish(),
  task_chars: z.number().nullish(),
  task_excerpt: z.string().nullish(),
  rounds: z.number().nullish(),
  tests_passed: z.boolean().nullish(),
  eval_tokens: z.number().nullish(),
  prompt_tokens: z.number().nullish(),
  tok_s: z.number().nullish(),
  fallback_used: z.boolean().nullish(),
  files: z.array(z.string()).nullish(),
  warnings: z.array(z.string()).nullish(),
  message: z.string().nullish(),
});

const reviewEntry = z.object({
  type: z.literal("review"),
  run_id: z.string(),
  ts: z.string(),
  verdict: z.enum(["accepted", "fixed", "rejected"]),
  reason: z.string().nullish(),
});

const entrySchema = z.discriminatedUnion("type", [runEntry, reviewEntry]);

// ── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = entrySchema.safeParse(body);

  if (!parsed.success) {
    return json(
      () => ({ ok: false, error: "invalid_payload", details: parsed.error.flatten() }),
      { status: 400 },
    );
  }

  const r = parsed.data;
  const db = getDb();

  if (r.type === "review") {
    db.insert(schema.delegateReviews)
      .values({
        runId: r.run_id,
        ts: Date.parse(r.ts),
        verdict: r.verdict,
        reason: r.reason ?? null,
      })
      .run();

    return json(() => ({ ok: true, type: "review", run_id: r.run_id }), { status: 201 });
  }

  // run entry — onConflictDoNothing for idempotency on run_id
  db.insert(schema.delegateRuns)
    .values({
      runId: r.run_id,
      ts: Date.parse(r.ts),
      workdir: r.workdir ?? null,
      project: r.workdir ? path.basename(r.workdir) : null,
      label: r.label ?? null,
      tier: r.tier ?? null,
      model: r.model ?? null,
      fallbackUsed: r.fallback_used ?? null,
      exitCode: r.exit_code,
      rounds: r.rounds ?? null,
      maxRounds: r.max_rounds ?? null,
      testsPassed: r.tests_passed ?? null,
      evalTokens: r.eval_tokens ?? null,
      promptTokens: r.prompt_tokens ?? null,
      tokS: r.tok_s ?? null,
      durationS: r.duration_s != null ? Number(r.duration_s) : null,
      testCmd: r.test_cmd ?? null,
      contextCount: r.context_count ?? null,
      taskSha: r.task_sha256 ?? null,
      taskChars: r.task_chars ?? null,
      taskExcerpt: r.task_excerpt ?? null,
      files: r.files ?? [],
      warnings: r.warnings ?? [],
      message: r.message ?? null,
    })
    .onConflictDoNothing()
    .run();

  return json(() => ({ ok: true, type: "run", run_id: r.run_id }), { status: 201 });
}

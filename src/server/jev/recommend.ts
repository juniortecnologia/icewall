import "server-only";
import fs from "node:fs";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { SecuritySnapshot, UpdatesSnapshot } from "@/lib/types";
import { getDb, schema } from "../db/client";
import { benchRecs } from "../bench/models-json";
import { MODELS_JSON } from "../lib/paths";
import { getSnapshot } from "../lib/store";
import { confidentNoul, delegationRecs, type AnswerMap, type JudgedRun, type Rec, tokenRecs } from "./rules";

/** Último julgamento bem-sucedido por assunto. */
export function answersByKind(kind: string): Map<string, AnswerMap> {
  const rows = getDb()
    .select({ subjectId: schema.jevJudgments.subjectId, answers: schema.jevJudgments.answers })
    .from(schema.jevJudgments)
    .where(and(eq(schema.jevJudgments.subjectKind, kind), isNotNull(schema.jevJudgments.answers)))
    .orderBy(schema.jevJudgments.ts)
    .all();
  return new Map(rows.map((r) => [r.subjectId, r.answers as AnswerMap]));
}

function readKeepAlive(): string | null {
  try {
    return JSON.parse(fs.readFileSync(MODELS_JSON, "utf8")).keep_alive ?? null;
  } catch {
    return null;
  }
}

function judgedRuns(): JudgedRun[] {
  const db = getDb();
  const since = Date.now() - 30 * 86_400_000;
  const runs = db
    .select()
    .from(schema.delegateRuns)
    .where(and(gte(schema.delegateRuns.ts, since), sql`coalesce(${schema.delegateRuns.label}, '') != 'bench'`))
    .all();
  const reviews = db.select().from(schema.delegateReviews).orderBy(schema.delegateReviews.ts).all();
  const verdict = new Map(reviews.map((r) => [r.runId, r.verdict]));
  const answers = answersByKind("delegation");
  return runs.map((r) => ({
    runId: r.runId,
    model: r.model,
    tier: r.tier,
    exitCode: r.exitCode,
    verdict: verdict.get(r.runId) ?? null,
    answers: answers.get(r.runId) ?? null,
  }));
}

function securityRecs(): Rec[] {
  const sec = getSnapshot<SecuritySnapshot>("security")?.data;
  if (!sec) return [];
  const exposure = answersByKind("port");
  return sec.findings.map((f) => {
    const port = f.key.startsWith("port:") ? sec.ports.find((p) => `port:${p.port}` === f.key) : undefined;
    const a = port ? exposure.get(`${port.port}:${port.service ?? "unknown"}`)?.risky_exposure : undefined;
    const risky = confidentNoul(a);
    const p = a?.type === "noul" ? a.noul : null;
    return {
      key: `sec:${f.key}`,
      area: "security" as const,
      severity: risky === true ? "crit" : risky === false ? "info" : f.severity,
      title: f.title,
      detail: f.detail + (p !== null ? ` Jev: risco de exposição ${Math.round(p * 100)}%.` : ""),
      action: f.fix,
      confidence: p,
      evidence: { finding: f.key },
    };
  });
}

function updateRecs(): Rec[] {
  const updates = getSnapshot<UpdatesSnapshot>("updates")?.data;
  if (!updates?.packages.length) return [];
  const judged = answersByKind("package");
  const urgent: string[] = [];
  const gpu: string[] = [];
  let judgedCount = 0;
  for (const p of updates.packages) {
    const a = judged.get(`${p.name}=${p.version}`);
    if (a) judgedCount++;
    const sev = a?.severity?.type === "score" ? a.severity.score : null;
    const touchesGpu = confidentNoul(a?.touches_gpu_stack) === true || confidentNoul(a?.needs_restart) === true;
    if (touchesGpu) gpu.push(p.name);
    else if ((sev !== null && sev >= 2.5) || (sev === null && p.security)) urgent.push(p.name);
  }
  const recs: Rec[] = [];
  if (urgent.length) {
    recs.push({
      key: "os:updates-urgent",
      area: "os",
      severity: "warn",
      title: `${urgent.length} update(s) de segurança para aplicar`,
      detail:
        judgedCount === updates.packages.length
          ? `Sem risco para a pilha da GPU segundo a Jev: ${urgent.join(", ")}.`
          : `Pacotes do repositório de segurança (${judgedCount ? "parte ainda sem" : "sem"} avaliação da Jev): ${urgent.join(", ")}.`,
      action: `sudo apt update && sudo apt install --only-upgrade ${urgent.join(" ")}`,
      confidence: null,
      evidence: urgent,
    });
  }
  if (gpu.length) {
    recs.push({
      key: "os:updates-gpu",
      area: "os",
      severity: "info",
      title: `${gpu.length} update(s) mexem na pilha da GPU ou pedem restart`,
      detail: `Aplicar numa janela sem delegações nem benchmarks rodando: ${gpu.join(", ")}.`,
      action: `sudo apt update && sudo apt install --only-upgrade ${gpu.join(" ")}  # depois: docker ps / nvidia-smi`,
      confidence: null,
      evidence: gpu,
    });
  }
  if (updates.rebootRequired) {
    recs.push({
      key: "os:reboot",
      area: "os",
      severity: "warn",
      title: "Reboot pendente",
      detail: `Pacotes: ${updates.rebootPackages.join(", ") || "?"}.`,
      action: "sudo reboot  # os containers com restart policy voltam sozinhos",
      confidence: null,
      evidence: updates.rebootPackages,
    });
  }
  return recs;
}

function claudeTokenStats() {
  const days = 7;
  const row = getDb()
    .select({
      cacheRead: sql<number>`coalesce(sum(${schema.claudeUsage.cacheRead}), 0)`,
      input: sql<number>`coalesce(sum(${schema.claudeUsage.inputTokens}), 0)`,
      cacheCreation: sql<number>`coalesce(sum(${schema.claudeUsage.cacheCreation}), 0)`,
    })
    .from(schema.claudeUsage)
    .where(gte(schema.claudeUsage.ts, Date.now() - days * 86_400_000))
    .get();
  return { cacheRead: row?.cacheRead ?? 0, input: row?.input ?? 0, cacheCreation: row?.cacheCreation ?? 0, days };
}

/** Recalcula todas as recomendações; as que deixaram de valer viram "done". */
export function rebuildRecommendations(): number {
  const recs = [
    ...securityRecs(),
    ...updateRecs(),
    ...delegationRecs(judgedRuns(), readKeepAlive()),
    ...tokenRecs(claudeTokenStats()),
    ...benchRecs(),
  ];
  const db = getDb();
  const now = Date.now();
  const keys = new Set(recs.map((r) => r.key));
  db.transaction((tx) => {
    for (const r of recs) {
      tx.insert(schema.recommendations)
        .values({ ...r, ts: now, status: "open" })
        .onConflictDoUpdate({
          target: schema.recommendations.key,
          set: {
            ts: now,
            severity: r.severity,
            title: r.title,
            detail: r.detail,
            action: r.action,
            confidence: r.confidence,
            evidence: r.evidence,
            // dispensada continua dispensada; resolvida que voltou reabre
            status: sql`case when ${schema.recommendations.status} = 'dismissed' then 'dismissed' else 'open' end`,
          },
        })
        .run();
    }
    const open = tx.select().from(schema.recommendations).where(eq(schema.recommendations.status, "open")).all();
    for (const o of open) {
      if (!keys.has(o.key)) {
        tx.update(schema.recommendations).set({ status: "done", ts: now }).where(eq(schema.recommendations.id, o.id)).run();
      }
    }
  });
  return recs.length;
}

export function openRecommendations() {
  return getDb()
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.status, "open"))
    .orderBy(desc(schema.recommendations.ts))
    .all();
}

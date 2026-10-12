import "server-only";
import fs from "node:fs";
import { eq, ne } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { getSetting } from "../lib/store";
import { MODELS_JSON } from "../lib/paths";
import type { Rec } from "../jev/rules";
import { DEFAULT_WEIGHTS, leaderboard, type ResultRow, type Weights } from "./leaderboard";

interface ModelsJson {
  keep_alive?: string;
  backend?: string;
  tiers: Record<string, { model: string; fallback?: string[]; backend?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

/** Onde o nível roda: o "backend" do nível ou, sem ele, o do topo (padrão "ollama", como na skill). */
export function tierBackend(cfg: ModelsJson, tier: string): string {
  return cfg.tiers[tier]?.backend ?? cfg.backend ?? "ollama";
}

export function readModelsJson(): ModelsJson | null {
  try {
    return JSON.parse(fs.readFileSync(MODELS_JSON, "utf8")) as ModelsJson;
  } catch {
    return null;
  }
}

/** Troca o modelo de um nível; o modelo antigo vira o primeiro fallback. Devolve o diff aplicado. */
export function setTierModel(tier: string, model: string, dryRun: boolean): { before: string; after: string } {
  const raw = fs.readFileSync(MODELS_JSON, "utf8");
  const cfg = JSON.parse(raw) as ModelsJson;
  const t = cfg.tiers[tier];
  if (!t) throw new Error(`nível desconhecido: ${tier}`);
  // O ranking mede modelos do Ollama; um nível no vLLM (o fast no Glis) troca de modelo no servidor, não aqui.
  if (tierBackend(cfg, tier) !== "ollama") throw new Error(`o nível ${tier} roda no vLLM (backend ${tierBackend(cfg, tier)}), não no Ollama`);
  const before = JSON.stringify({ [tier]: { model: t.model, fallback: t.fallback ?? [] } });
  if (t.model !== model) {
    const fallback = [t.model, ...(t.fallback ?? []).filter((m) => m !== model && m !== t.model)];
    cfg.tiers[tier] = { ...t, model, fallback };
  }
  const after = JSON.stringify({ [tier]: { model: cfg.tiers[tier].model, fallback: cfg.tiers[tier].fallback ?? [] } });
  if (!dryRun) {
    fs.copyFileSync(MODELS_JSON, `${MODELS_JSON}.bak`);
    fs.writeFileSync(MODELS_JSON, `${JSON.stringify(cfg, null, 2)}\n`);
    JSON.parse(fs.readFileSync(MODELS_JSON, "utf8")); // garante JSON válido
  }
  return { before, after };
}

export function setKeepAlive(keepAlive: string): { before: string; after: string } {
  const raw = fs.readFileSync(MODELS_JSON, "utf8");
  const cfg = JSON.parse(raw) as ModelsJson;
  const before = cfg.keep_alive ?? "padrão";
  cfg.keep_alive = keepAlive;
  fs.copyFileSync(MODELS_JSON, `${MODELS_JSON}.bak`);
  fs.writeFileSync(MODELS_JSON, `${JSON.stringify(cfg, null, 2)}\n`);
  return { before: String(before), after: keepAlive };
}

export function benchWeights(): Weights {
  return { ...DEFAULT_WEIGHTS, ...getSetting<Partial<Weights>>("bench:weights", {}) };
}

export function benchRows(): ResultRow[] {
  return getDb()
    .select({
      model: schema.benchResults.model,
      task: schema.benchResults.task,
      ok: schema.benchResults.ok,
      firstTry: schema.benchResults.firstTry,
      durationS: schema.benchResults.durationS,
      tokS: schema.benchResults.tokS,
      promptTokS: schema.benchResults.promptTokS,
      ttftMs: schema.benchResults.ttftMs,
      loadMs: schema.benchResults.loadMs,
      sizeVram: schema.benchResults.sizeVram,
    })
    .from(schema.benchResults)
    // A bancada do Spark mede combinações de serviços, não modelos do Ollama: fica fora do ranking.
    .innerJoin(schema.benchRuns, eq(schema.benchRuns.id, schema.benchResults.benchRunId))
    .where(ne(schema.benchRuns.kind, "spark"))
    .all();
}

/** Sugere trocar o modelo do nível fast quando o benchmark aponta outro claramente melhor. */
export function benchRecs(): Rec[] {
  const cfg = readModelsJson();
  const fast = cfg?.tiers.fast?.model;
  if (!fast || tierBackend(cfg, "fast") !== "ollama") return [];
  const board = leaderboard(benchRows(), benchWeights()).filter((s) => s.qualityRuns >= 7);
  const top = board[0];
  const current = board.find((s) => s.model === fast);
  if (!top || !current || top.model === fast) return [];
  if ((top.passRate ?? 0) < (current.passRate ?? 0)) return [];
  return [
    {
      key: "bench:fast-model",
      area: "models",
      severity: "info",
      title: `Benchmark: ${top.model} supera ${fast} no nível fast`,
      detail: `Score ${top.score.toFixed(2)} contra ${current.score.toFixed(2)} (acerto ${Math.round((top.passRate ?? 0) * 100)}% × ${Math.round((current.passRate ?? 0) * 100)}%, ${top.qualityRuns} e ${current.qualityRuns} execuções).`,
      action: `models.json: "fast" → "${top.model}" (botão Aplicar em Benchmarks)`,
      confidence: null,
      evidence: { top: top.model, current: fast },
    },
  ];
}

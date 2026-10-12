import "server-only";
import { getDb, schema } from "../db/client";
import { answersByKind } from "./recommend";
import { confidentChoice, confidentNoul, isSuccess } from "./rules";

export interface DecisionFactor {
  name: string;
  weight: number;
  description: string;
}

export interface RouteRecommendation {
  recommendedTier: "fast" | "quality" | "direct_cloud";
  recommendedModel: string;
  confidence: number;
  reason: string;
  estimatedTokensSaved: number;
  factors: DecisionFactor[];
  historicalSuccessRate: number | null;
  sampleSize: number;
}

export interface TaskRequest {
  task: string;
  contextChars?: number;
  hasTests?: boolean;
  taskKind?: string;
}

// Modelos padrão por tier no Spark
const DEFAULT_MODELS = {
  fast: "chat", // Qwen3.6-35B-A3B no vLLM
  quality: "gemma4:26b", // Gemma 26B no Ollama
  direct_cloud: "claude-direct",
};

/**
 * Classifica heuristicamente o tipo de tarefa caso não seja fornecido explicitamente.
 */
export function estimateTaskKind(taskText: string): string {
  const lower = taskText.toLowerCase();
  if (/test|vitest|jest|pytest|mock|assert|spec\b/.test(lower)) return "tests";
  if (/type|interface|schema|zod|drizzle|dto\b/.test(lower)) return "types";
  if (/boilerplate|scaffold|config|template|setup|package\.json/.test(lower)) return "boilerplate";
  if (/convert|migra|parse|parser|transform|format/.test(lower)) return "conversion";
  if (/component|css|tailwind|html|view|page|ui\b/.test(lower)) return "ui_component";
  if (/refactor|rename|limp|organiz/.test(lower)) return "refactor";
  if (/doc|readme|coment|manual/.test(lower)) return "docs";
  if (/helper|util|slugify|calc|funç|fn\b/.test(lower)) return "utility";
  return "other";
}

/**
 * Motor preditivo de roteamento baseado nos julgamentos acumulados da Jev.
 * Avalia o pedido antes de gastar tokens na inferência.
 */
export function evaluatePreRouting(req: TaskRequest): RouteRecommendation {
  const taskText = req.task.trim();
  const taskChars = taskText.length;
  const contextChars = req.contextChars ?? 0;
  const taskKind = req.taskKind || estimateTaskKind(taskText);

  const db = getDb();
  const allRuns = db.select().from(schema.delegateRuns).all();
  const reviews = db.select().from(schema.delegateReviews).all();
  const verdictMap = new Map(reviews.map((r) => [r.runId, r.verdict]));
  const answers = answersByKind("delegation");

  // Estatísticas históricas da Jev para esse tipo de tarefa
  const relevantRuns = allRuns
    .map((r) => {
      const a = answers.get(r.runId);
      const k = confidentChoice(a?.task_kind);
      const worth = confidentNoul(a?.worth_delegating);
      const bestRoute = confidentChoice(a?.best_route);
      const verdict = verdictMap.get(r.runId) ?? null;
      const success = isSuccess({ exitCode: r.exitCode, verdict });
      return { ...r, inferredKind: k, worth, bestRoute, success };
    })
    .filter((r) => r.inferredKind === taskKind || (!r.inferredKind && estimateTaskKind(r.taskExcerpt ?? "") === taskKind));

  const sampleSize = relevantRuns.length;
  const successCount = relevantRuns.filter((r) => r.success).length;
  const historicalSuccessRate = sampleSize > 0 ? Math.round((successCount / sampleSize) * 100) / 100 : null;

  const factors: DecisionFactor[] = [];
  let recommendedTier: "fast" | "quality" | "direct_cloud" = "fast";
  let confidence = 0.8;
  let reason = "";

  // Fator 1: Tamanho do prompt e contexto
  const estSpecTokens = Math.round(taskChars / 3.5);
  const estContextTokens = Math.round(contextChars / 3.5);
  const totalTokens = estSpecTokens + estContextTokens;

  factors.push({
    name: "Tamanho do Contexto",
    weight: totalTokens > 24000 ? 0.9 : 0.4,
    description: `Spec: ~${estSpecTokens} tok | Contexto: ~${estContextTokens} tok (Total: ~${totalTokens} tok)`,
  });

  if (totalTokens > 24000) {
    recommendedTier = "direct_cloud";
    confidence = 0.95;
    reason = "Contexto excede o limite seguro de janela/geração para os modelos locais rápidos (limite de 24k tokens do vLLM).";
  } else if (sampleSize >= 3) {
    // Fator 2: Histórico de julgamentos da Jev
    const worthCount = relevantRuns.filter((r) => r.worth === true).length;
    const worthRate = worthCount / sampleSize;

    factors.push({
      name: "Validade da Delegação (Jev)",
      weight: 0.8,
      description: `Histórico Jev para '${taskKind}': ${Math.round(worthRate * 100)}% de taxa de economia comprovada em ${sampleSize} tarefas.`,
    });

    if (worthRate < 0.35 && estSpecTokens < 200) {
      recommendedTier = "direct_cloud";
      confidence = 0.85;
      reason = `A Jev identificou que tarefas curtas de '${taskKind}' têm alto índice de retrabalho ou custo de spec comparável ao código gerado. Melhor resolver diretamente.`;
    } else if (historicalSuccessRate !== null && historicalSuccessRate < 0.5) {
      recommendedTier = "quality";
      confidence = 0.8;
      reason = `Taxa de sucesso no modelo rápido para '${taskKind}' é de apenas ${Math.round(historicalSuccessRate * 100)}%. Recomendado subir para o tier 'quality' (Gemma4:26b) para maior rigor lógico.`;
    } else {
      recommendedTier = "fast";
      confidence = 0.85;
      reason = `Tarefas de '${taskKind}' têm bom histórico de sucesso (${historicalSuccessRate ? Math.round(historicalSuccessRate * 100) : 100}%) no modelo rápido local (vLLM / Qwen3.6-35B).`;
    }
  } else {
    // Sem histórico suficiente para o tipo de tarefa
    if (["tests", "boilerplate", "conversion", "utility"].includes(taskKind)) {
      recommendedTier = "fast";
      confidence = 0.75;
      reason = `Tarefa mecânica do tipo '${taskKind}'. Ideal para o modelo ultra-rápido local (~125 tok/s).`;
    } else {
      recommendedTier = "quality";
      confidence = 0.7;
      reason = `Tarefa do tipo '${taskKind}' pode exigir maior capacidade de raciocínio. Recomendado tier 'quality' (Gemma4:26b).`;
    }
  }

  // Estimativa de tokens economizados da nuvem se for executado localmente
  const estOutputTokens = Math.max(300, Math.round(estSpecTokens * 2.5));
  const estimatedTokensSaved = recommendedTier === "direct_cloud" ? 0 : estOutputTokens;

  return {
    recommendedTier,
    recommendedModel: DEFAULT_MODELS[recommendedTier],
    confidence,
    reason,
    estimatedTokensSaved,
    factors,
    historicalSuccessRate,
    sampleSize,
  };
}

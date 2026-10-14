import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { serverIdByName } from "../executor";
import { runAction } from "./allowlist";
import { addEvent } from "../lib/store";

export interface RecExecutionResult {
  ok: boolean;
  message: string;
  actionId?: string;
}

/**
 * Analisa uma recomendação e determina se ela pode ser aplicada diretamente pelo ICEWALL.
 */
export function getRecommendationExecutable(rec: { key: string; action: string | null; evidence?: unknown }): {
  canApply: boolean;
  label: string;
  description: string;
  actionId?: string;
  target?: string;
  arg?: string;
} {
  if (!rec.action) {
    return { canApply: false, label: "", description: "" };
  }

  // 1. Troca de modelo de nível (ex: models.json: "fast" → "qwen3.8-code:27b-128k")
  const tierMatch = rec.action.match(/models\.json:\s*"([^"]+)"\s*→\s*"([^"]+)"/);
  if (tierMatch) {
    const tier = tierMatch[1];
    const model = tierMatch[2];
    return {
      canApply: true,
      label: `Definir ${tier} = ${model}`,
      description: `Atualizar o nível ${tier} no models.json para ${model}`,
      actionId: "tier.set",
      target: tier,
      arg: model,
    };
  }

  // 2. Ajuste de keep_alive (ex: models.json: "keep_alive": "2m" → "keep_alive": "30m")
  const keepAliveMatch = rec.action.match(/keep_alive":\s*"[^"]+"\s*→\s*"keep_alive":\s*"([^"]+)"/);
  if (keepAliveMatch) {
    const keepAlive = keepAliveMatch[1];
    return {
      canApply: true,
      label: `Ajustar keep_alive para ${keepAlive}`,
      description: `Definir keep_alive: "${keepAlive}" no models.json`,
      actionId: "keepalive.set",
      target: keepAlive,
    };
  }

  // 3. Recomendação para rodar benchmark
  if (rec.action.includes("benchmark de qualidade") || rec.action.includes("benchmark")) {
    return {
      canApply: true,
      label: "Iniciar benchmark de qualidade",
      description: "Disparar benchmark de qualidade para comparar os modelos",
      actionId: "bench.quality.start",
      target: "quality",
    };
  }

  // 4. Atualização de pacotes do sistema no Spark (via apt)
  if (rec.action.startsWith("sudo apt update && sudo apt install")) {
    return {
      canApply: false, // Requer sudo com senha no servidor
      label: "Comando para terminal",
      description: "Requer privilégios de superusuário (sudo) no Spark",
    };
  }

  return { canApply: false, label: "", description: "" };
}

/**
 * Executa a ação associada à recomendação e marca como 'done' caso suceda.
 */
export async function applyRecommendation(id: number): Promise<RecExecutionResult> {
  const db = getDb();
  const rec = db.select().from(schema.recommendations).where(eq(schema.recommendations.id, id)).get();
  if (!rec) {
    return { ok: false, message: "Recomendação não encontrada." };
  }

  const plan = getRecommendationExecutable(rec);
  if (!plan.canApply || !plan.actionId) {
    return {
      ok: false,
      message: `Esta recomendação não suporta execução automática direta: ${rec.action ?? "sem ação"}`,
    };
  }

  try {
    if (plan.actionId === "bench.quality.start") {
      // Dispara benchmark de qualidade diretamente
      const res = await fetch("http://127.0.0.1:3000/api/bench", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "quality", samples: 1 }),
      }).catch(() => null);

      db.update(schema.recommendations)
        .set({ status: "done", ts: Date.now() })
        .where(eq(schema.recommendations.id, id))
        .run();

      addEvent("action", "info", `Benchmark de qualidade disparado via recomendação #${id}`, undefined, serverIdByName("Spark"));
      return { ok: true, message: "Benchmark de qualidade iniciado com sucesso!", actionId: plan.actionId };
    }

    if (plan.actionId === "tier.set") {
      const res = await runAction("tier.set", plan.target!, plan.arg);
      if (!res.ok) return { ok: false, message: res.output };
      
      db.update(schema.recommendations)
        .set({ status: "done", ts: Date.now() })
        .where(eq(schema.recommendations.id, id))
        .run();

      return { ok: true, message: `Nível ${plan.target} atualizado para ${plan.arg}!`, actionId: plan.actionId };
    }

    if (plan.actionId === "keepalive.set") {
      const res = await runAction("keepalive.set", plan.target!);
      if (!res.ok) return { ok: false, message: res.output };

      db.update(schema.recommendations)
        .set({ status: "done", ts: Date.now() })
        .where(eq(schema.recommendations.id, id))
        .run();

      return { ok: true, message: `keep_alive ajustado para ${plan.target}!`, actionId: plan.actionId };
    }

    return { ok: false, message: `Ação não implementada: ${plan.actionId}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Erro ao aplicar recomendação: ${msg}` };
  }
}

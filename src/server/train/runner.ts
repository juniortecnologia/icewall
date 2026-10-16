import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";

/**
 * Fila de treinos (Fase 2, Etapa T0) — espelha o padrão da fila de benchmarks
 * (src/server/bench/runner.ts): um job por vez, progresso em colunas,
 * cancelamento cooperativo (o runner confere o status entre os passos).
 *
 * O runner REAL (workspace no servidor, docker de treino, poll de loss, stop
 * por pid) chega na Etapa T2. Até lá, o processador marca o job enfileirado
 * como falho com mensagem clara — um job "queued" para sempre seria zumbi.
 */

type TrainJob = typeof schema.trainJobs.$inferSelect;

const g = globalThis as unknown as { __icewallTrainBusy?: boolean };

function progress(id: number, set: Partial<typeof schema.trainJobs.$inferInsert>) {
  getDb().update(schema.trainJobs).set({ ...set, updatedTs: Date.now() }).where(eq(schema.trainJobs.id, id)).run();
}

/** Chamado pelo agendador: processa o próximo treino da fila, um por vez. */
export async function processTrainQueue(): Promise<void> {
  if (g.__icewallTrainBusy) return;
  const next: TrainJob | undefined = getDb()
    .select()
    .from(schema.trainJobs)
    .where(eq(schema.trainJobs.status, "queued"))
    .orderBy(schema.trainJobs.id)
    .get();
  if (!next) return;
  g.__icewallTrainBusy = true;
  try {
    // Etapa T2 substitui este bloco pelo runner real (docker/Unsloth no
    // servidor do registro). Falha explícita em vez de fila parada.
    progress(next.id, {
      status: "failed",
      error: "runner de treino ainda não implementado (chega na Etapa T2 — docker/Unsloth)",
      finishedAt: Date.now(),
    });
  } catch (err) {
    progress(next.id, { status: "failed", error: String(err), finishedAt: Date.now() });
  } finally {
    g.__icewallTrainBusy = false;
  }
}

/** Treinos que ficaram "running" quando o painel reiniciou não vão terminar: marca como falhos. */
export function recoverStaleTrain(): void {
  getDb()
    .update(schema.trainJobs)
    .set({ status: "failed", error: "painel reiniciado durante o treino", finishedAt: Date.now(), updatedTs: Date.now() })
    .where(eq(schema.trainJobs.status, "running"))
    .run();
}

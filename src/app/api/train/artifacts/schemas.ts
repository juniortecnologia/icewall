import { z } from "zod";
import type { trainArtifacts } from "@/server/db/schema";

/** Filtros do GET (todos opcionais, via querystring). */
export const listArtifactsQuery = z.object({
  serverId: z.coerce.number().int().positive().optional(),
  jobId: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

type ArtifactRow = typeof trainArtifacts.$inferSelect;

/** Projeção explícita para GET — o padrão do `safeServer`. */
export interface SafeTrainArtifact {
  id: number;
  ts: number;
  jobId: number | null;
  serverId: number;
  kind: "gguf" | "adapter" | "checkpoint" | "merged";
  quant: string | null;
  remotePath: string;
  sizeBytes: number | null;
  status: "pending" | "running" | "done" | "failed";
  error: string | null;
  promovido: boolean;
  promoDestino: string | null;
  atualizadoEm: number;
}

export function safeTrainArtifact(a: ArtifactRow): SafeTrainArtifact {
  return {
    id: a.id,
    ts: a.ts,
    jobId: a.jobId,
    serverId: a.serverId,
    kind: a.kind,
    quant: a.quant,
    remotePath: a.remotePath,
    sizeBytes: a.sizeBytes,
    status: a.status,
    error: a.error,
    promovido: a.promovido,
    promoDestino: a.promoDestino,
    atualizadoEm: a.atualizadoEm,
  };
}

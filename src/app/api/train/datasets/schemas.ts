import { z } from "zod";
import type { trainDatasets } from "@/server/db/schema";

/** Conversão aplicada ao gravar o JSONL: chat ({ messages }) ou texto ({ text }). */
export const formatoTreino = z.enum(["chat", "text"]);

/** Campos de texto do FormData de upload (o arquivo vem à parte). */
export const uploadDatasetFields = z.object({
  serverId: z.coerce.number().int().positive(),
  formatoTreino: formatoTreino.default("chat"),
});

/** Filtros do GET (todos opcionais, via querystring). */
export const listDatasetsQuery = z.object({
  serverId: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export const previewQuery = z.object({
  quantidade: z.coerce.number().int().min(1).max(20).default(10),
});

type TrainDatasetRow = typeof trainDatasets.$inferSelect;

/** Projeção explícita para GET — padrão `safeServer`. */
export interface SafeTrainDataset {
  id: number;
  ts: number;
  serverId: number;
  nome: string;
  formato: "jsonl" | "json" | "csv" | "txt";
  formatoTreino: "chat" | "text";
  remotePath: string;
  sizeBytes: number | null;
  samples: number | null;
  validacao: { total?: number; duplicados?: number; vazios?: number } | null;
  atualizadoEm: number;
}

export function safeTrainDataset(d: TrainDatasetRow): SafeTrainDataset {
  return {
    id: d.id,
    ts: d.ts,
    serverId: d.serverId,
    nome: d.nome,
    formato: d.formato,
    formatoTreino: d.formatoTreino,
    remotePath: d.remotePath,
    sizeBytes: d.sizeBytes,
    samples: d.samples,
    validacao: d.validacao,
    atualizadoEm: d.atualizadoEm,
  };
}

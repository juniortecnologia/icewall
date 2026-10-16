import { z } from "zod";
import type { TrainJobParams, trainJobs } from "@/server/db/schema";

/** Ambiente do job: lab (experimento) ou producao (candidato à promoção, T4). */
export const trainAmbiente = z.enum(["lab", "producao"]);

export const trainMethod = z.enum(["lora", "qlora", "full"]);

/** Nome aceito para modelo base (mesma família do `shellArg`). */
const modelName = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => /^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,199}$/.test(v), { message: "Nome inválido para modelo" });

/** Hiperparâmetros. Defaults = presets recomendados do Unsloth (r=16, alpha=16, dropout=0). */
export const trainParamsBody = z.object({
  learningRate: z.number().positive().max(1e-2).default(2e-4),
  epochs: z.number().int().min(1).max(50).default(3),
  r: z.number().int().min(1).max(256).default(16),
  alpha: z.number().int().min(1).max(1024).default(16),
  dropout: z.number().min(0).max(0.5).default(0),
  batchSize: z.number().int().min(1).max(256).default(2),
  gradientAccumulationSteps: z.number().int().min(1).max(32).default(4),
  maxSeqLength: z.number().int().min(128).max(131072).default(2048),
  maxSamples: z.number().int().min(1).max(200000).optional(),
  bf16: z.boolean().default(true),
});

/** Payload de criação. O dataset é registrado (datasetId) OU caminho já no servidor (datasetPath). */
export const createTrainJobBody = z
  .object({
    serverId: z.number().int().positive(),
    ambiente: trainAmbiente.default("lab"),
    baseModel: modelName,
    method: trainMethod,
    datasetId: z.number().int().positive().optional(),
    datasetPath: z.string().min(1).max(1024).optional(),
    params: trainParamsBody.optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.datasetId && !v.datasetPath) {
      ctx.addIssue({
        code: "custom",
        path: ["datasetId"],
        message: "informe datasetId (registrado) ou datasetPath (caminho já no servidor)",
      });
    }
  });

export type CreateTrainJobInput = z.infer<typeof createTrainJobBody>;

/** Filtros do GET (todos opcionais, via querystring). */
export const listTrainJobsQuery = z.object({
  status: z.enum(["queued", "running", "done", "failed", "cancelled"]).optional(),
  ambiente: trainAmbiente.optional(),
  serverId: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

type TrainJobRow = typeof trainJobs.$inferSelect;

/**
 * Projeção explícita para GET — o padrão do `safeServer`: campo só aparece na
 * resposta quando entra aqui de propósito. De fora ficam detalhes internos da
 * execução remota (`workspacePath`, `remotePid`).
 */
export interface SafeTrainJob {
  id: number;
  ts: number;
  serverId: number;
  ambiente: "lab" | "producao";
  baseModel: string;
  method: "lora" | "qlora" | "full";
  datasetId: number | null;
  datasetPath: string | null;
  params: TrainJobParams | null;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progressPct: number;
  epochsDone: number;
  totalEpochs: number;
  lossHistory: { step: number; value: number }[] | null;
  valLoss: number | null;
  current: string | null;
  error: string | null;
  gpuMemUsedMib: number | null;
  gpuMemTotalMib: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export function safeTrainJob(j: TrainJobRow): SafeTrainJob {
  return {
    id: j.id,
    ts: j.ts,
    serverId: j.serverId,
    ambiente: j.ambiente,
    baseModel: j.baseModel,
    method: j.method,
    datasetId: j.datasetId,
    datasetPath: j.datasetPath,
    params: j.paramsJson,
    status: j.status,
    progressPct: j.progressPct,
    epochsDone: j.epochsDone,
    totalEpochs: j.totalEpochs,
    lossHistory: j.lossHistory,
    valLoss: j.valLoss,
    current: j.current,
    error: j.error,
    gpuMemUsedMib: j.gpuMemUsedMib,
    gpuMemTotalMib: j.gpuMemTotalMib,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}

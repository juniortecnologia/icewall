import { connection, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { servers, trainDatasets, trainJobs } from "@/server/db/schema";
import { withAuth } from "@/server/auth/withAuth";
import { createTrainJobBody, listTrainJobsQuery, safeTrainJob, trainParamsBody } from "./schemas";

/**
 * Fila de treinos `/treinar` — Fase 2, Etapa T0. Espelha a fila de benchmarks:
 * o POST apenas enfileira; o agendador (job "train", 5 s) processa um por vez.
 * Leitura dinâmica: cookies()/connection() mantêm a rota fora do pré-render
 * (cacheComponents, Next 16).
 */

// ── GET /api/train/jobs?status=&ambiente=&serverId=&limite= ────────────────

export const GET = withAuth(async (req) => {
  await connection();
  const q = listTrainJobsQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) {
    return NextResponse.json(
      { ok: false, error: "query_invalida", details: q.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const where = and(
    q.data.status ? eq(trainJobs.status, q.data.status) : undefined,
    q.data.ambiente ? eq(trainJobs.ambiente, q.data.ambiente) : undefined,
    q.data.serverId ? eq(trainJobs.serverId, q.data.serverId) : undefined,
  );

  const rows = getDb()
    .select()
    .from(trainJobs)
    .where(where)
    .orderBy(desc(trainJobs.id))
    .limit(q.data.limite)
    .all();
  return NextResponse.json({ ok: true, jobs: rows.map(safeTrainJob) });
});

// ── POST /api/train/jobs (enfileira; o runner do agendador executa) ────────

export const POST = withAuth(
  async (req) => {
    const cfg = req.validatedBody!;
    const db = getDb();

    const server = db.select({ id: servers.id }).from(servers).where(eq(servers.id, cfg.serverId)).limit(1).get();
    if (!server) {
      return NextResponse.json(
        { ok: false, error: "servidor_inexistente", message: `servidor ${cfg.serverId} não está no registro (cadastre em /servers)` },
        { status: 400 },
      );
    }

    // Dataset registrado resolve o caminho remoto; datasetPath é usado como veio.
    const datasetId = cfg.datasetId ?? null;
    let datasetPath = cfg.datasetPath ?? null;
    if (datasetId !== null) {
      const ds = db.select().from(trainDatasets).where(eq(trainDatasets.id, datasetId)).limit(1).get();
      if (!ds || ds.serverId !== cfg.serverId) {
        return NextResponse.json(
          { ok: false, error: "dataset_invalido", message: "datasetId não encontrado neste servidor" },
          { status: 400 },
        );
      }
      datasetPath = ds.remotePath;
    }

    const params = cfg.params ?? trainParamsBody.parse({});
    const criado = db
      .insert(trainJobs)
      .values({
        ts: Date.now(),
        serverId: cfg.serverId,
        ambiente: cfg.ambiente,
        baseModel: cfg.baseModel,
        method: cfg.method,
        datasetId,
        datasetPath,
        paramsJson: params,
        status: "queued",
        totalEpochs: params.epochs,
        updatedTs: Date.now(),
      })
      .returning()
      .get()!;
    return NextResponse.json({ ok: true, job: safeTrainJob(criado) }, { status: 201 });
  },
  { bodySchema: createTrainJobBody },
);

import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db/client";
import { withAuth } from "@/server/auth/withAuth";
import { QUANTS } from "@/server/train/export";
import { safeTrainArtifact } from "@/app/api/train/artifacts/schemas";

/**
 * Exporta um treino concluído para GGUF (T3): cria o registro 'pending' em
 * train_artifacts com o caminho final esperado; a fila de exports (scheduler)
 * executa no container icewall-quant e marca done|failed.
 */

type Ctx = { params: Promise<{ id: string }> };

const exportBody = z.object({ quant: z.enum(QUANTS) });

async function exportar(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  const parsed = exportBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validacao_erro", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const quant = parsed.data.quant;

  const db = getDb();
  const job = db.select().from(schema.trainJobs).where(eq(schema.trainJobs.id, numId)).limit(1).get();
  if (!job) {
    return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  }
  if (job.status !== "done") {
    return NextResponse.json(
      { ok: false, error: "job_nao_concluido", message: `job está "${job.status}" — só treinos concluídos exportam` },
      { status: 400 },
    );
  }
  if (!job.workspacePath) {
    return NextResponse.json({ ok: false, error: "sem_workspace", message: "job concluído sem workspace no servidor" }, { status: 400 });
  }

  const emAndamento = db
    .select({ id: schema.trainArtifacts.id })
    .from(schema.trainArtifacts)
    .where(and(eq(schema.trainArtifacts.jobId, numId), eq(schema.trainArtifacts.quant, quant), inArray(schema.trainArtifacts.status, ["pending", "running"])))
    .limit(1)
    .get();
  if (emAndamento) {
    return NextResponse.json({ ok: false, error: "export_em_andamento", message: `já existe export ${quant} para este job` }, { status: 409 });
  }

  const criado = db
    .insert(schema.trainArtifacts)
    .values({
      jobId: numId,
      serverId: job.serverId,
      kind: "gguf",
      quant,
      remotePath: `${job.workspacePath}/export-${quant}/gguf-${quant}.gguf`,
      status: "pending",
    })
    .returning()
    .get()!;
  return NextResponse.json({ ok: true, artifact: safeTrainArtifact(criado) }, { status: 201 });
}

export const POST = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => exportar(authReq, ctx))(req);

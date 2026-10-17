import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db/client";
import { withAuth } from "@/server/auth/withAuth";
import { execOnServer } from "@/server/executor";
import { shellPath } from "@/server/spark/ssh";
import { safeTrainArtifact } from "../schemas";

/**
 * Detalhe e remoção de um artifact. Remover apaga o arquivo/diretório remoto
 * e o registro — nunca um export ainda pendente/em execução.
 */

type Ctx = { params: Promise<{ id: string }> };

async function detalhe(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  const row = getDb().select().from(schema.trainArtifacts).where(eq(schema.trainArtifacts.id, numId)).limit(1).get();
  if (!row) {
    return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, artifact: safeTrainArtifact(row) });
}

async function excluir(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  const row = getDb().select().from(schema.trainArtifacts).where(eq(schema.trainArtifacts.id, numId)).limit(1).get();
  if (!row) {
    return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  }
  if (row.status === "pending" || row.status === "running") {
    return NextResponse.json({ ok: false, error: "em_andamento", message: "export ainda não concluído" }, { status: 409 });
  }
  const res = await execOnServer(row.serverId, `rm -rf ${shellPath(row.remotePath)}`, 15_000);
  if (res.code !== 0) {
    return NextResponse.json({ ok: false, error: "remoto", message: res.stderr.trim() || `exit ${res.code}` }, { status: 502 });
  }
  getDb().delete(schema.trainArtifacts).where(eq(schema.trainArtifacts.id, numId)).run();
  return NextResponse.json({ ok: true, removido: row.remotePath });
}

export const GET = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => detalhe(authReq, ctx))(req);
export const DELETE = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => excluir(authReq, ctx))(req);

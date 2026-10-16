import { connection, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { trainDatasets } from "@/server/db/schema";
import { withAuth } from "@/server/auth/withAuth";
import { DatasetError, removerDataset } from "@/server/train/datasets";
import { safeTrainDataset } from "../schemas";

/**
 * Detalhe e remoção de um dataset. Next 16: `params` é Promise — o withAuth
 * não repassa o ctx da rota, então o fechamos por closure.
 */

type Ctx = { params: Promise<{ id: string }> };

async function idValido(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const numId = Number(id);
  return Number.isInteger(numId) && numId > 0 ? numId : null;
}

async function detalhe(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const numId = await idValido(ctx);
  if (numId === null) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  const row = getDb().select().from(trainDatasets).where(eq(trainDatasets.id, numId)).limit(1).get();
  if (!row) {
    return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, dataset: safeTrainDataset(row) });
}

async function excluir(req: Request, ctx: Ctx): Promise<Response> {
  const numId = await idValido(ctx);
  if (numId === null) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  try {
    const removido = await removerDataset(numId);
    return NextResponse.json({ ok: true, ...removido });
  } catch (err) {
    if (err instanceof DatasetError) {
      const status = err.code === "nao_encontrado" ? 404 : err.code === "em_uso" ? 409 : err.code === "remoto" ? 502 : 400;
      return NextResponse.json({ ok: false, error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}

export const GET = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => detalhe(authReq, ctx))(req);
export const DELETE = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => excluir(authReq, ctx))(req);

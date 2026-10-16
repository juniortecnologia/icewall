import { connection, NextResponse } from "next/server";
import { withAuth } from "@/server/auth/withAuth";
import { DatasetError, previewDataset } from "@/server/train/datasets";
import { previewQuery } from "../../schemas";

/**
 * Pré-visualização de um dataset: primeiras N amostras do arquivo remoto
 * (`head` pelo executor — barato mesmo em arquivos grandes).
 */

type Ctx = { params: Promise<{ id: string }> };

async function preview(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  const q = previewQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) {
    return NextResponse.json(
      { ok: false, error: "query_invalida", details: q.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  try {
    const resultado = await previewDataset(numId, q.data.quantidade);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    if (err instanceof DatasetError) {
      const status = err.code === "nao_encontrado" ? 404 : err.code === "remoto" ? 502 : 400;
      return NextResponse.json({ ok: false, error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}

export const GET = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => preview(authReq, ctx))(req);

import { connection, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { trainJobs } from "@/server/db/schema";
import { withAuth } from "@/server/auth/withAuth";
import { safeTrainJob } from "../schemas";

/**
 * Detalhe de um job de treino. Next 16: `params` é Promise — o withAuth não
 * repassa o ctx da rota, então o fechamos por closure (mesma sessão/auth do
 * wrapper).
 */

type Ctx = { params: Promise<{ id: string }> };

async function detalhe(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  const row = getDb().select().from(trainJobs).where(eq(trainJobs.id, numId)).limit(1).get();
  if (!row) {
    return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job: safeTrainJob(row) });
}

export const GET = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => detalhe(authReq, ctx))(req);

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { trainJobs } from "@/server/db/schema";
import { withAuth } from "@/server/auth/withAuth";
import { safeTrainJob } from "../../schemas";

/**
 * Cancela um job na fila ou em execução (o runner para entre um passo e
 * outro, como na fila de bench). Idempotente: job já terminado responde ok
 * com `cancelado: false`. Em T2, o runner remoto vê o status "cancelled" e
 * mata pid + container no servidor.
 */

type Ctx = { params: Promise<{ id: string }> };

async function parar(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }

  const db = getDb();
  const row = db.select().from(trainJobs).where(eq(trainJobs.id, numId)).limit(1).get();
  if (!row) {
    return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  }

  if (row.status === "queued" || row.status === "running") {
    db.update(trainJobs)
      .set({ status: "cancelled", current: null, finishedAt: Date.now(), updatedTs: Date.now() })
      .where(eq(trainJobs.id, numId))
      .run();
    const atual = db.select().from(trainJobs).where(eq(trainJobs.id, numId)).limit(1).get()!;
    return NextResponse.json({ ok: true, cancelado: true, job: safeTrainJob(atual) });
  }

  return NextResponse.json({ ok: true, cancelado: false, message: `job já está "${row.status}"`, job: safeTrainJob(row) });
}

export const POST = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => parar(authReq, ctx))(req);

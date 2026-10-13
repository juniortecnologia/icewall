import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasAuditLogs } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    const db = getDb();
    const logs = db
      .select()
      .from(saasAuditLogs)
      .where(eq(saasAuditLogs.tenantId, session.tenantId))
      .orderBy(desc(saasAuditLogs.createdAt))
      .limit(limit)
      .all();

    return NextResponse.json({ ok: true, logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

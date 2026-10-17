import { connection, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { trainArtifacts } from "@/server/db/schema";
import { withAuth } from "@/server/auth/withAuth";
import { listArtifactsQuery, safeTrainArtifact } from "./schemas";

/** Artefatos do /treinar (T3): adapters registrados pelo runner e exports GGUF. */

export const GET = withAuth(async (req) => {
  await connection();
  const q = listArtifactsQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) {
    return NextResponse.json(
      { ok: false, error: "query_invalida", details: q.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const where = and(
    q.data.serverId ? eq(trainArtifacts.serverId, q.data.serverId) : undefined,
    q.data.jobId ? eq(trainArtifacts.jobId, q.data.jobId) : undefined,
  );
  const rows = getDb()
    .select()
    .from(trainArtifacts)
    .where(where)
    .orderBy(desc(trainArtifacts.id))
    .limit(q.data.limite)
    .all();
  return NextResponse.json({ ok: true, artifacts: rows.map(safeTrainArtifact) });
});

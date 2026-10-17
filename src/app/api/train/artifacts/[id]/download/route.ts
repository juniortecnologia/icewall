import { createReadStream } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/server/db/client";
import { withAuth } from "@/server/auth/withAuth";
import { driverFor } from "@/server/executor";
import { nomeGguf } from "@/server/train/export";
import type { ServerDriver } from "@/lib/servers/server-driver";

/**
 * Download de um artifact (T3): o arquivo remoto vem pelo driver do servidor
 * (get) para um tmp local e é streamado para o navegador; o tmp é removido
 * quando o stream fecha.
 */

type Ctx = { params: Promise<{ id: string }> };

async function baixar(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  }
  const artifact = getDb().select().from(schema.trainArtifacts).where(eq(schema.trainArtifacts.id, numId)).limit(1).get();
  if (!artifact) {
    return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  }
  if (artifact.status !== "done") {
    return NextResponse.json({ ok: false, error: "nao_pronto", message: `artifact está "${artifact.status}"` }, { status: 409 });
  }

  let jobBase = "modelo";
  if (artifact.jobId) {
    const job = getDb().select().from(schema.trainJobs).where(eq(schema.trainJobs.id, artifact.jobId)).limit(1).get();
    if (job) jobBase = job.baseModel;
  }
  const fileName = artifact.kind === "gguf" && artifact.quant ? nomeGguf(jobBase, artifact.quant) : path.basename(artifact.remotePath);

  const driver: ServerDriver = driverFor(artifact.serverId);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "icewall-dl-"));
  const local = path.join(tmp, fileName);
  try {
    await driver.get(artifact.remotePath, local);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    driver.close();
    return NextResponse.json(
      { ok: false, error: "remoto", message: `falha ao baixar do servidor: ${String(err instanceof Error ? err.message : err)}` },
      { status: 502 },
    );
  }

  const stream = createReadStream(local);
  stream.on("close", () => {
    fs.rmSync(tmp, { recursive: true, force: true });
    driver.close();
  });
  const web = Readable.toWeb(stream) as unknown as BodyInit;
  return new Response(web, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${fileName}"`,
      ...(artifact.sizeBytes ? { "content-length": String(artifact.sizeBytes) } : {}),
    },
  });
}

export const GET = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => baixar(authReq, ctx))(req);

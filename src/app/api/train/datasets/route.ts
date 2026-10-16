import { connection, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { servers, trainDatasets } from "@/server/db/schema";
import { withAuth } from "@/server/auth/withAuth";
import { DatasetError, TAMANHO_MAX_BYTES, enviarDataset } from "@/server/train/datasets";
import { listDatasetsQuery, safeTrainDataset, uploadDatasetFields } from "./schemas";

/**
 * Datasets do `/treinar` — Fase 2, Etapa T1.
 * GET: lista registrada (filtro por servidor). POST: upload multipart →
 * conversão/validação → envio pelo driver do servidor → registro.
 * O POST consome FormData: validação dos campos na mão via zod (o bodySchema
 * do withAuth é para JSON).
 */

// ── GET /api/train/datasets?serverId=&limite= ──────────────────────────────

export const GET = withAuth(async (req) => {
  await connection();
  const q = listDatasetsQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) {
    return NextResponse.json(
      { ok: false, error: "query_invalida", details: q.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const rows = getDb()
    .select()
    .from(trainDatasets)
    .where(q.data.serverId ? eq(trainDatasets.serverId, q.data.serverId) : undefined)
    .orderBy(desc(trainDatasets.id))
    .limit(q.data.limite)
    .all();
  return NextResponse.json({ ok: true, datasets: rows.map(safeTrainDataset) });
});

// ── POST /api/train/datasets (multipart: arquivo + serverId + formatoTreino) ──

export const POST = withAuth(async (req) => {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "form_invalido", message: "esperado multipart/form-data" }, { status: 400 });
  }

  const campos = uploadDatasetFields.safeParse({
    serverId: form.get("serverId"),
    formatoTreino: form.get("formatoTreino") ?? undefined,
  });
  if (!campos.success) {
    return NextResponse.json(
      { ok: false, error: "validacao_erro", details: campos.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ ok: false, error: "arquivo_ausente", message: "campo 'arquivo' ausente ou vazio" }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "arquivo_grande", message: `máximo de ${Math.floor(TAMANHO_MAX_BYTES / (1024 * 1024))} MB por arquivo` },
      { status: 413 },
    );
  }

  const db = getDb();
  const server = db.select({ id: servers.id }).from(servers).where(eq(servers.id, campos.data.serverId)).limit(1).get();
  if (!server) {
    return NextResponse.json(
      { ok: false, error: "servidor_inexistente", message: `servidor ${campos.data.serverId} não está no registro (cadastre em /servers)` },
      { status: 400 },
    );
  }

  try {
    const resultado = await enviarDataset({
      serverId: campos.data.serverId,
      nomeArquivo: arquivo.name,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
      formatoTreino: campos.data.formatoTreino,
    });
    const row = db.select().from(trainDatasets).where(eq(trainDatasets.id, resultado.id)).limit(1).get()!;
    return NextResponse.json({ ok: true, dataset: safeTrainDataset(row), validacao: resultado.validacao }, { status: 201 });
  } catch (err) {
    if (err instanceof DatasetError) {
      const status = err.code === "nome_duplicado" ? 409 : err.code === "remoto" ? 502 : 400;
      return NextResponse.json({ ok: false, error: err.code, message: err.message }, { status });
    }
    throw err; // withAuth sanitiza em 500 com ID de correlação
  }
});

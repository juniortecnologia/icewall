import { connection, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { servers } from "@/server/db/schema";
import { guardMutation } from "@/server/api";
import { updateServerBody, safeServer } from "../schemas";

/**
 * Registro central de servidores — detalhe por id.
 * GET: detalhe (sem chaveSshPath/vllmKey); PUT: atualiza; DELETE: remove.
 * Contexto de rota no padrão Next 16: `params` é uma Promise (await).
 */

type Ctx = { params: Promise<{ id: string }> };

async function findById(idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return { bad: true as const };
  const db = getDb();
  const row = db.select().from(servers).where(eq(servers.id, id)).limit(1).get();
  return { bad: false as const, row: row ?? null };
}

// ── GET /api/train/servers/:id ─────────────────────────────────────────────

export async function GET(req: Request, ctx: Ctx) {
  await connection();
  try {
    const { id } = await ctx.params;
    const found = await findById(id);
    if (found.bad) {
      return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
    }
    if (!found.row) {
      return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, server: safeServer(found.row) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── PUT /api/train/servers/:id ─────────────────────────────────────────────

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const guard = guardMutation(req);
    if (guard) return guard;

    const { id } = await ctx.params;
    const db = getDb();
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
    }

    const existing = db.select().from(servers).where(eq(servers.id, numId)).limit(1).get();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateServerBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "validacao_erro", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Não expor chaves na resposta — campos não enviados não são tocados.
    const p = parsed.data;
    const updates: Record<string, unknown> = {};
    if (p.nome !== undefined) updates.nome = p.nome;
    if (p.tipo !== undefined) updates.tipo = p.tipo;
    if (p.host !== undefined) updates.host = p.host;
    if (p.porta !== undefined) updates.porta = p.porta;
    if (p.usuario !== undefined) updates.usuario = p.usuario;
    if (p.chaveSshPath !== undefined) updates.chaveSshPath = p.chaveSshPath || null;
    if (p.vllmUrl !== undefined) updates.vllmUrl = p.vllmUrl || null;
    if (p.vllmKey !== undefined) updates.vllmKey = p.vllmKey || null;
    if (p.capacidades !== undefined) updates.capacidades = p.capacidades;

    // Um servidor SSH não pode ficar sem host/usuario/chave após a mudança.
    const mergedTipo = (updates.tipo as "local" | "ssh" | undefined) ?? existing.tipo;
    const mergedHost = (updates.host as string | undefined) ?? existing.host;
    const mergedUsuario = (updates.usuario as string | null | undefined) ?? existing.usuario;
    const mergedChave = (updates.chaveSshPath as string | null | undefined) ?? existing.chaveSshPath;
    if (mergedTipo === "ssh" && (!mergedHost || !mergedUsuario || !mergedChave)) {
      return NextResponse.json(
        {
          ok: false,
          error: "campos_ssh_incompletos",
          message: "Servidor SSH exige host, usuario e chaveSshPath preenchidos",
        },
        { status: 400 },
      );
    }

    if (Object.keys(updates).length > 0) {
      updates.atualizadoEm = Date.now();
      db.update(servers).set(updates).where(eq(servers.id, numId)).run();
    }

    const updated = db.select().from(servers).where(eq(servers.id, numId)).limit(1).get()!;
    return NextResponse.json({ ok: true, server: safeServer(updated) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── DELETE /api/train/servers/:id ──────────────────────────────────────────

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const guard = guardMutation(req);
    if (guard) return guard;

    const { id } = await ctx.params;
    const db = getDb();
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
    }

    const existing = db.select().from(servers).where(eq(servers.id, numId)).limit(1).get();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    }

    const nome = existing.nome;
    db.delete(servers).where(eq(servers.id, numId)).run();

    return NextResponse.json({ ok: true, message: `Servidor "${nome}" removido` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

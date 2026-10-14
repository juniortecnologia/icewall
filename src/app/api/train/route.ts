import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { trainServers } from "@/server/db/schema";

// ── Zod schemas ─────────────────────────────────────────────────────────────

const createServerBody = z.object({
  nome: z.string().min(1).max(64),
  tipo: z.enum(["spark", "generic"]),
  host: z.string().min(1).max(253),
  porta: z.number().int().min(1).max(65535).default(22),
  usuario: z.string().min(1).max(128),
  chaveSshPath: z.string().min(1).describe("caminho local para o arquivo de chave SSH no disco"),
});

const updateServerBody = z.object({
  nome: z.string().min(1).max(64).optional(),
  tipo: z.enum(["spark", "generic"]).optional(),
  host: z.string().min(1).max(253).optional(),
  porta: z.number().int().min(1).max(65535).optional(),
  usuario: z.string().min(1).max(128).optional(),
  chaveSshPath: z.string().min(1).optional(),
});

// ── GET /api/servers ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const db = getDb();
    const servers = db.select().from(trainServers).all();

    // Nunca expor a chave SSH no retorno
    const safe = servers.map((s) => ({
      id: s.id,
      nome: s.nome,
      tipo: s.tipo,
      host: s.host,
      porta: s.porta,
      usuario: s.usuario,
      criadoEm: s.criadoEm,
      atualizadoEm: s.atualizadoEm,
    }));

    return NextResponse.json({ ok: true, servers: safe });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── POST /api/servers ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createServerBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "validacao_erro", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const cfg = parsed.data;
    const db = getDb();

    // Verificar nome único
    const existing = db.select().from(trainServers).where(eq(trainServers.nome, cfg.nome)).limit(1).get();
    if (existing) {
      return NextResponse.json({ ok: false, error: "nome_duplicado", message: `Já existe um servidor com nome "${cfg.nome}"` }, { status: 409 });
    }

    const now = Date.now();
    const newServer = {
      ...cfg,
      porta: cfg.porta ?? 22,
      criadoEm: now,
      atualizadoEm: now,
    };

    db.insert(trainServers).values(newServer).run();

    // Retorna sem chave SSH
    const { chaveSshPath, ...safe } = newServer;
    return NextResponse.json({ ok: true, server: safe }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── PUT /api/servers/:id ────────────────────────────────────────────────────

export async function PUT(req: Request) {
  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id") ?? url.pathname.split("/").pop();
    if (!idParam || isNaN(Number(idParam))) {
      return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updateServerBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "validacao_erro", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const db = getDb();
    const existing = db.select().from(trainServers).where(eq(trainServers.id, Number(idParam))).limit(1).get();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    }

    // Não expor chave SSH na resposta — omitir se não foi enviada no update
    const updates: Record<string, unknown> = {};
    const p = parsed.data;
    if (p.nome !== undefined) updates.nome = p.nome;
    if (p.tipo !== undefined) updates.tipo = p.tipo;
    if (p.host !== undefined) updates.host = p.host;
    if (p.porta !== undefined) updates.porta = Number(p.porta);
    if (p.usuario !== undefined) updates.usuario = p.usuario;
    if (p.chaveSshPath !== undefined) updates.chaveSshPath = p.chaveSshPath;

    if (Object.keys(updates).length > 0) {
      updates.atualizadoEm = Date.now();
      db.update(trainServers).set(updates).where(eq(trainServers.id, Number(idParam))).run();
    }

    const updated = db.select().from(trainServers).where(eq(trainServers.id, Number(idParam))).limit(1).get()!;
    const { chaveSshPath, ...safe } = updated;
    return NextResponse.json({ ok: true, server: safe });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── DELETE /api/servers/:id ─────────────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id") ?? url.pathname.split("/").pop();
    if (!idParam || isNaN(Number(idParam))) {
      return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
    }

    const db = getDb();
    const existing = db.select().from(trainServers).where(eq(trainServers.id, Number(idParam))).limit(1).get();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    }

    const nome = existing.nome;
    db.delete(trainServers).where(eq(trainServers.id, Number(idParam))).run();

    return NextResponse.json({ ok: true, message: `Servidor "${nome}" removido` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

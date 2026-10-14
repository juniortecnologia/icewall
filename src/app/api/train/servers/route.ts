import { connection, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { servers } from "@/server/db/schema";
import { guardMutation } from "@/server/api";
import { createServerBody, safeServer } from "./schemas";

/**
 * Registro central de servidores — Etapa 01 do plano multi-servidor.
 * GET: lista servidores (sem chaveSshPath/vllmKey); POST: cria.
 */

// ── GET /api/train/servers ─────────────────────────────────────────────────

export async function GET() {
  // connection() antes da consulta: queries síncronas do better-sqlite3
  // completariam no pré-render com cacheComponents ativo (Next 16).
  await connection();
  try {
    const db = getDb();
    const rows = db.select().from(servers).orderBy(servers.nome).all();
    return NextResponse.json({ ok: true, servers: rows.map(safeServer) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── POST /api/train/servers ────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const guard = guardMutation(req);
    if (guard) return guard;

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
    const existing = db.select().from(servers).where(eq(servers.nome, cfg.nome)).limit(1).get();
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "nome_duplicado", message: `Já existe um servidor com nome "${cfg.nome}"` },
        { status: 409 },
      );
    }

    const now = Date.now();
    const novo = {
      nome: cfg.nome,
      tipo: cfg.tipo,
      host: cfg.tipo === "local" ? "localhost" : (cfg.host ?? "localhost"),
      porta: cfg.porta ?? (cfg.tipo === "ssh" ? 22 : null),
      usuario: cfg.usuario ?? null,
      chaveSshPath: cfg.chaveSshPath || null,
      vllmUrl: cfg.vllmUrl || null,
      vllmKey: cfg.vllmKey || null,
      capacidades: cfg.capacidades ?? null,
      criadoEm: now,
      atualizadoEm: now,
    };

    const criado = db.insert(servers).values(novo).returning().get()!;
    return NextResponse.json({ ok: true, server: safeServer(criado) }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { servers } from "@/server/db/schema";
import { execOnServer } from "@/server/executor";
import { getSession } from "@/server/auth/session";

/**
 * Terminal multi-servidor (Etapa 04): o alvo é SEMPRE um servidor do registro
 * central `servers`, resolvido por id (`serverId` no corpo) — nunca um IP ou
 * usuário fixo. Sem `serverId`, o padrão é o servidor local (a Station, onde o
 * icewall roda); sem servidor local, o primeiro do registro.
 */

const body = z.object({
  command: z.string().min(1),
  serverId: z.number().int().positive().optional(),
});

function fail(output: string, exitCode = -1, status = 200) {
  return NextResponse.json({ ok: false, output, exitCode }, { status });
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Comando ausente ou payload inválido" }, { status: 400 });
    }
    const { command, serverId } = parsed.data;

    const trimmed = command.trim();
    if (!trimmed) {
      return NextResponse.json({ ok: true, output: "" });
    }

    const db = getDb();
    let row: typeof servers.$inferSelect | undefined;
    if (serverId !== undefined) {
      row = db.select().from(servers).where(eq(servers.id, serverId)).limit(1).get();
      if (!row) {
        return fail(`servidor inexistente no registro: id ${serverId} (cadastre em /servers)`, -1, 404);
      }
    } else {
      // Padrão: máquina local; se não houver servidor local, o primeiro do registro.
      row = db.select().from(servers).where(eq(servers.tipo, "local")).orderBy(servers.id).limit(1).get()
        ?? db.select().from(servers).orderBy(servers.id).limit(1).get();
      if (!row) {
        return fail("nenhum servidor cadastrado no registro — cadastre em /servers", -1, 400);
      }
    }

    const res = await execOnServer(row.id, trimmed, 20_000);
    return NextResponse.json({
      ok: res.code === 0,
      output: res.stdout + (res.stderr ? `\n[stderr]\n${res.stderr}` : ""),
      exitCode: res.code,
      server: { id: row.id, nome: row.nome, tipo: row.tipo, host: row.tipo === "ssh" ? row.host : "localhost", usuario: row.usuario },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

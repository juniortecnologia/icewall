import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/crypto";
import { recordAuditLog } from "@/server/auth/audit";
import { ensureInitialTenantAndAdmin } from "@/server/auth/init";

export async function GET() {
  try {
    ensureInitialTenantAndAdmin();
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const db = getDb();
    const users = db
      .select({
        id: saasUsers.id,
        tenantId: saasUsers.tenantId,
        name: saasUsers.name,
        email: saasUsers.email,
        role: saasUsers.role,
        twoFactorEnabled: saasUsers.twoFactorEnabled,
        createdAt: saasUsers.createdAt,
        updatedAt: saasUsers.updatedAt,
      })
      .from(saasUsers)
      .where(eq(saasUsers.tenantId, session.tenantId))
      .orderBy(desc(saasUsers.createdAt))
      .all();

    return NextResponse.json({ ok: true, users });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    ensureInitialTenantAndAdmin();
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Apenas administradores podem criar usuários" }, { status: 403 });
    }

    const body = await req.json();
    const { name, email, password, role } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ ok: false, error: "Nome, e-mail e senha são obrigatórios" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: "A senha deve ter pelo menos 6 caracteres" }, { status: 400 });
    }

    const validRoles = ["admin", "operator", "viewer"];
    const userRole = validRoles.includes(role) ? role : "operator";

    const db = getDb();
    const existing = db.select().from(saasUsers).where(eq(saasUsers.email, email.toLowerCase().trim())).get();
    if (existing) {
      return NextResponse.json({ ok: false, error: "Já existe um usuário cadastrado com este e-mail" }, { status: 409 });
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    db.insert(saasUsers).values({
      id: userId,
      tenantId: session.tenantId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: hashPassword(password),
      role: userRole,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    }).run();

    await recordAuditLog({
      action: "user.create",
      detail: { userId, name: name.trim(), email: email.toLowerCase().trim(), role: userRole },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        tenantId: session.tenantId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: userRole,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

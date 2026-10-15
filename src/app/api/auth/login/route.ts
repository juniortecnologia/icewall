import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { ensureInitialTenantAndAdmin } from "@/server/auth/init";
import { verifyPassword } from "@/server/auth/crypto";
import { signSession } from "@/server/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { validationError, authError, errorResponse } from "@/server/api";

export async function POST(req: Request) {
  try {
    ensureInitialTenantAndAdmin();
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return validationError("Email e senha são obrigatórios");
    }

    const db = getDb();
    const user = db.select().from(saasUsers).where(eq(saasUsers.email, email.trim())).get();

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return authError("Credenciais inválidas");
    }

    // Se o usuário tem 2FA ativado, cria sessão temporária com twoFactorPassed = false
    const twoFactorRequired = Boolean(user.twoFactorEnabled);
    const sessionToken = await signSession({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      twoFactorPassed: !twoFactorRequired,
    });

    const res = NextResponse.json({
      ok: true,
      twoFactorRequired,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 dias
    });

    return res;
  } catch (err) {
    return errorResponse(err, "auth/login");
  }
}

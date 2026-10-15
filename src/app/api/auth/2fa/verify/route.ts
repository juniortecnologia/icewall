import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { getSession, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { verifyTwoFactorToken } from "@/server/auth/totp";
import { signSession } from "@/server/auth/jwt";
import { validationError, authError, errorResponse } from "@/server/api";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return authError("Sessão expirada ou inválida");
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return validationError("Código de autenticação obrigatório");
    }

    const db = getDb();
    const user = db.select().from(saasUsers).where(eq(saasUsers.id, session.userId)).get();
    if (!user || !user.twoFactorSecret) {
      return validationError("Usuário ou segredo 2FA não encontrado");
    }

    const isValid = verifyTwoFactorToken(token, user.twoFactorSecret);
    if (!isValid) {
      return validationError("Código 2FA incorreto ou expirado");
    }

    // Promove a sessão para twoFactorPassed = true
    const updatedToken = await signSession({
      ...session,
      twoFactorPassed: true,
    });

    const res = NextResponse.json({ ok: true, message: "Autenticação em dois fatores confirmada" });
    res.cookies.set(SESSION_COOKIE_NAME, updatedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch (err) {
    return errorResponse(err, "auth/2fa/verify");
  }
}

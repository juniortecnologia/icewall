import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { getSession, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { verifyTwoFactorToken } from "@/server/auth/totp";
import { signSessionEdge } from "@/server/auth/jwt-edge";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Sessão expirada ou inválida" }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, error: "Código de autenticação obrigatório" }, { status: 400 });
    }

    const db = getDb();
    const user = db.select().from(saasUsers).where(eq(saasUsers.id, session.userId)).get();
    if (!user || !user.twoFactorSecret) {
      return NextResponse.json({ ok: false, error: "Usuário ou segredo 2FA não encontrado" }, { status: 400 });
    }

    const isValid = verifyTwoFactorToken(token, user.twoFactorSecret);
    if (!isValid) {
      return NextResponse.json({ ok: false, error: "Código 2FA incorreto ou expirado" }, { status: 400 });
    }

    // Promove a sessão para twoFactorPassed = true
    const updatedToken = await signSessionEdge({
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";

export async function POST() {
  const res = NextResponse.json({ ok: true, message: "Desconectado com sucesso" });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}

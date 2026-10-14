import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./server/auth/session";
import { verifySession } from "./server/auth/jwt";

const PUBLIC_PATHS = ["/login", "/login/2fa", "/api/auth/login", "/api/auth/logout", "/api/auth/2fa/verify"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets, favicon, etc.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  // Se o usuário não está autenticado e tenta acessar rota protegida
  if (!session && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Se o usuário está logado mas precisa passar pelo 2FA e tenta acessar rota protegida
  if (session && !session.twoFactorPassed && !pathname.startsWith("/login/2fa") && !pathname.startsWith("/api/auth")) {
    const twoFaUrl = new URL("/login/2fa", req.url);
    return NextResponse.redirect(twoFaUrl);
  }

  // Se já está logado com 2FA completo e tenta ir para a tela de login
  if (session && session.twoFactorPassed && (pathname === "/login" || pathname === "/login/2fa")) {
    return NextResponse.redirect(new URL("/servers", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { generateTwoFactorSecret, getTwoFactorOtpAuthUrl, generateQrCodeDataUrl } from "@/server/auth/totp";
import { errorResponse } from "@/server/api";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const db = getDb();
    const user = db.select().from(saasUsers).where(eq(saasUsers.id, session.userId)).get();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 404 });
    }

    const secret = user.twoFactorSecret || generateTwoFactorSecret();

    // Salva o segredo gerado caso ainda não estivesse salvo
    if (!user.twoFactorSecret) {
      db.update(saasUsers)
        .set({ twoFactorSecret: secret })
        .where(eq(saasUsers.id, user.id))
        .run();
    }

    const otpAuthUrl = getTwoFactorOtpAuthUrl(user.email, secret);
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpAuthUrl);

    // NÃO retornar o secret no response — apenas otpAuthUrl e qrCode
    // O secret fica salvo no banco e o usuário configura via QR code
    return NextResponse.json({
      ok: true,
      otpAuthUrl,
      qrCode: qrCodeDataUrl,
      enabled: Boolean(user.twoFactorEnabled),
    });
  } catch (err) {
    return errorResponse(err, "auth/2fa/setup");
  }
}

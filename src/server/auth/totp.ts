import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

/** Generate a new base32 TOTP secret */
export function generateTwoFactorSecret(): string {
  return generateSecret();
}

/** Generate otpauth URI for QR code apps like Google Authenticator or 1Password */
export function getTwoFactorOtpAuthUrl(email: string, secret: string, issuer = "ICEWALL Cloud"): string {
  return generateURI({
    issuer,
    label: email,
    secret,
  });
}

/** Generate QR code Data URL for display */
export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/** Verify a TOTP 6-digit code against secret */
export function verifyTwoFactorToken(token: string, secret: string): boolean {
  try {
    const res = verifySync({ token: token.trim(), secret });
    return res.valid;
  } catch {
    return false;
  }
}

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserSession } from "./jwt-edge";

export type { UserSession };

const JWT_SECRET = process.env.JWT_SECRET || "icewall-default-secret-dev-2025-token";

/** Hash password using standard PBKDF2 with SHA-512 (zero external binaries required) */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

/** Verify password against salt:hash string */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) return false;
    const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(originalHash, "hex"));
  } catch {
    return false;
  }
}

/** Create signed JWT token */
export function signSessionToken(session: UserSession, expiresIn = "7d"): string {
  return jwt.sign(session, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

/** Verify and decode JWT token */
export function verifySessionToken(token: string): UserSession | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
    return decoded;
  } catch {
    return null;
  }
}

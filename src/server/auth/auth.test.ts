import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./crypto";
import { signSession, verifySession } from "./jwt";
import { generateTwoFactorSecret, getTwoFactorOtpAuthUrl, verifyTwoFactorToken } from "./totp";
import { generateSync } from "otplib";

describe("SaaS Auth & Crypto", () => {
  it("should hash and correctly verify passwords with PBKDF2", () => {
    const rawPassword = "SuperSecretPassword123!";
    const hashed = hashPassword(rawPassword);

    expect(hashed).toContain(":");
    expect(verifyPassword(rawPassword, hashed)).toBe(true);
    expect(verifyPassword("WrongPassword", hashed)).toBe(false);
  });

  it("should sign and verify valid session JWT tokens", async () => {
    const sessionPayload = {
      userId: "user_test_123",
      tenantId: "tenant_test_123",
      email: "test@icewall.ai",
      name: "Test Admin",
      role: "admin",
      twoFactorPassed: true,
    };

    const token = await signSession(sessionPayload);
    expect(typeof token).toBe("string");

    const decoded = await verifySession(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("user_test_123");
    expect(decoded?.email).toBe("test@icewall.ai");
    expect(decoded?.twoFactorPassed).toBe(true);
  });

  it("should reject tampered JWT tokens", async () => {
    const sessionPayload = {
      userId: "user_1",
      tenantId: "tenant_1",
      email: "a@b.com",
      name: "A",
      role: "admin",
      twoFactorPassed: false,
    };
    const token = await signSession(sessionPayload);
    const tampered = token.slice(0, -5) + "abcde";

    expect(await verifySession(tampered)).toBeNull();
  });
});

describe("SaaS 2FA (TOTP)", () => {
  it("should generate valid secret and otpauth url", () => {
    const secret = generateTwoFactorSecret();
    expect(secret).toBeDefined();
    expect(secret.length).toBeGreaterThanOrEqual(16);

    const otpauth = getTwoFactorOtpAuthUrl("user@icewall.ai", secret);
    expect(otpauth).toContain("otpauth://totp/");
    expect(otpauth).toContain("user%40icewall.ai");
  });

  it("should accurately verify valid and invalid TOTP tokens", () => {
    const secret = generateTwoFactorSecret();
    const currentToken = generateSync({ secret });

    expect(verifyTwoFactorToken(currentToken, secret)).toBe(true);
    expect(verifyTwoFactorToken("000000", secret)).toBe(false);
  });
});

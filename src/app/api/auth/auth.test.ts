import { describe, expect, it, vi, beforeEach } from "vitest";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/crypto";
import { generateTwoFactorSecret } from "@/server/auth/totp";

// Test helper functions (defined at top for TypeScript)
const req = (
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request => {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

const getReq = (url: string, headers: Record<string, string> = {}): Request => {
  return new Request(url, {
    method: "GET",
    headers,
  });
};

// Mock Next.js request scope
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

// Mock cookies for session
vi.mock("next/headers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/headers")>();
  return {
    ...actual,
    cookies: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ value: "mock-session-token" }),
      delete: vi.fn(),
      set: vi.fn(),
    }),
  };
});

// Mock verifySession
vi.mock("@/server/auth/jwt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/jwt")>();
  return {
    ...actual,
    verifySession: vi.fn().mockResolvedValue({
      userId: "user_admin_01",
      tenantId: "tenant_default_01",
      email: "admin@icewall.ai",
      name: "Administrador ICEWALL",
      role: "admin",
      twoFactorPassed: true,
    }),
    signSession: vi.fn().mockResolvedValue("mock-jwt-token"),
  };
});

// Mock verifyPassword
vi.mock("@/server/auth/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/crypto")>();
  return {
    ...actual,
    verifyPassword: vi.fn().mockReturnValue(true),
    hashPassword: vi.fn().mockReturnValue("salt:hash"),
  };
});

// Mock verifyTwoFactorToken
vi.mock("@/server/auth/totp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/totp")>();
  return {
    ...actual,
    verifyTwoFactorToken: vi.fn().mockReturnValue(true),
    generateTwoFactorSecret: vi.fn().mockReturnValue("TESTSECRET123"),
    getTwoFactorOtpAuthUrl: vi.fn().mockReturnValue("otpauth://totp/..."),
    generateQrCodeDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,..."),
  };
});

// Import after mocks
import { POST as loginPost } from "./login/route";
import { POST as verify2faPost } from "./2fa/verify/route";
import { GET as setup2faGet } from "./2fa/setup/route";
import { POST as logoutPost } from "./logout/route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    // Ensure admin user exists
    const db = getDb();
    const existing = db.select().from(saasUsers).where(eq(saasUsers.email, "admin@icewall.ai")).get();
    if (!existing) {
      db.insert(saasUsers).values({
        id: "user_admin_01",
        tenantId: "tenant_default_01",
        email: "admin@icewall.ai",
        name: "Administrador ICEWALL",
        passwordHash: hashPassword("AdminPass123!"),
        role: "admin",
        twoFactorEnabled: false,
        twoFactorSecret: null,
      }).run();
    }
  });

  it("retorna 400 se email ou senha ausentes", async () => {
    const res = await loginPost(req("http://localhost/api/auth/login", { email: "admin@icewall.ai" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Email e senha são obrigatórios");
  });

  it("retorna 401 para credenciais inválidas", async () => {
    const { verifyPassword } = await import("@/server/auth/crypto");
    vi.mocked(verifyPassword).mockReturnValueOnce(false);

    const res = await loginPost(req("http://localhost/api/auth/login", {
      email: "admin@icewall.ai",
      password: "wrong",
    }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Credenciais inválidas");
  });

  it("retorna 200 com sessão e cookie para credenciais válidas (sem 2FA)", async () => {
    const { verifyPassword } = await import("@/server/auth/crypto");
    vi.mocked(verifyPassword).mockReturnValueOnce(true);

    const res = await loginPost(req("http://localhost/api/auth/login", {
      email: "admin@icewall.ai",
      password: "AdminPass123!",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.twoFactorRequired).toBe(false);
    expect(data.user.email).toBe("admin@icewall.ai");
    // Check cookie is set
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("icewall_session="))).toBe(true);
  });

  it("retorna twoFactorRequired=true se usuário tem 2FA habilitado", async () => {
    const { verifyPassword } = await import("@/server/auth/crypto");
    vi.mocked(verifyPassword).mockReturnValueOnce(true);

    // Enable 2FA for admin user
    const db = getDb();
    const secret = generateTwoFactorSecret();
    db.update(saasUsers)
      .set({ twoFactorEnabled: true, twoFactorSecret: secret })
      .where(eq(saasUsers.email, "admin@icewall.ai"))
      .run();

    const res = await loginPost(req("http://localhost/api/auth/login", {
      email: "admin@icewall.ai",
      password: "AdminPass123!",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.twoFactorRequired).toBe(true);
  });
});

describe("POST /api/auth/2fa/verify", () => {
  it("retorna 401 sem sessão válida", async () => {
    const { verifySession } = await import("@/server/auth/jwt");
    vi.mocked(verifySession).mockResolvedValueOnce(null);

    const res = await verify2faPost(req("http://localhost/api/auth/2fa/verify", { token: "123456" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Sessão expirada ou inválida");
  });

  it("retorna 400 se token ausente", async () => {
    const res = await verify2faPost(req("http://localhost/api/auth/2fa/verify", {}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Código de autenticação obrigatório");
  });

  it("retorna 400 se usuário não tem 2FA configurado", async () => {
    const { verifySession } = await import("@/server/auth/jwt");
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: "user_admin_01",
      tenantId: "tenant_default_01",
      email: "admin@icewall.ai",
      name: "Administrador ICEWALL",
      role: "admin",
      twoFactorPassed: false,
    });
    // Mock user without 2FA secret
    const { getDb } = await import("@/server/db/client");
    const { saasUsers } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    db.update(saasUsers).set({ twoFactorSecret: null, twoFactorEnabled: false }).where(eq(saasUsers.id, "user_admin_01")).run();

    const res = await verify2faPost(req("http://localhost/api/auth/2fa/verify", { token: "123456" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Usuário ou segredo 2FA não encontrado");
  });

  it("retorna 400 se token 2FA inválido", async () => {
    const { verifySession } = await import("@/server/auth/jwt");
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: "user_admin_01",
      tenantId: "tenant_default_01",
      email: "admin@icewall.ai",
      name: "Administrador ICEWALL",
      role: "admin",
      twoFactorPassed: false,
    });
    const { verifyTwoFactorToken } = await import("@/server/auth/totp");
    vi.mocked(verifyTwoFactorToken).mockReturnValueOnce(false);
    // Ensure 2FA is enabled with a secret
    const { getDb } = await import("@/server/db/client");
    const { saasUsers } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    db.update(saasUsers).set({ twoFactorEnabled: true, twoFactorSecret: "TESTSECRET123" }).where(eq(saasUsers.id, "user_admin_01")).run();

    const res = await verify2faPost(req("http://localhost/api/auth/2fa/verify", { token: "000000" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Código 2FA incorreto ou expirado");
  });

  it("retorna 200 e atualiza sessão com twoFactorPassed=true para token válido", async () => {
    const { verifySession } = await import("@/server/auth/jwt");
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: "user_admin_01",
      tenantId: "tenant_default_01",
      email: "admin@icewall.ai",
      name: "Administrador ICEWALL",
      role: "admin",
      twoFactorPassed: false,
    });
    const { verifyTwoFactorToken } = await import("@/server/auth/totp");
    vi.mocked(verifyTwoFactorToken).mockReturnValueOnce(true);
    // Ensure 2FA is enabled with a secret
    const { getDb } = await import("@/server/db/client");
    const { saasUsers } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    db.update(saasUsers).set({ twoFactorEnabled: true, twoFactorSecret: "TESTSECRET123" }).where(eq(saasUsers.id, "user_admin_01")).run();

    const res = await verify2faPost(req("http://localhost/api/auth/2fa/verify", { token: "123456" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toBe("Autenticação em dois fatores confirmada");
    // Check cookie is updated
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("icewall_session="))).toBe(true);
  });
});

describe("GET /api/auth/2fa/setup", () => {
  it("retorna 401 sem sessão válida", async () => {
    const { verifySession } = await import("@/server/auth/jwt");
    vi.mocked(verifySession).mockResolvedValueOnce(null);

    const res = await setup2faGet();
    expect(res.status).toBe(401);
  });

  it("retorna 200 com secret, otpAuthUrl e qrCode para usuário autenticado", async () => {
    const { verifySession } = await import("@/server/auth/jwt");
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: "user_admin_01",
      tenantId: "tenant_default_01",
      email: "admin@icewall.ai",
      name: "Administrador ICEWALL",
      role: "admin",
      twoFactorPassed: true,
    });
    // Ensure 2FA is disabled for this user
    const { getDb } = await import("@/server/db/client");
    const { saasUsers } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    db.update(saasUsers).set({ twoFactorSecret: null, twoFactorEnabled: false }).where(eq(saasUsers.id, "user_admin_01")).run();

    const res = await setup2faGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.secret).toBeDefined();
    expect(data.otpAuthUrl).toContain("otpauth://totp/");
    expect(data.qrCode).toContain("data:image/png;base64,");
    expect(data.enabled).toBe(false);
  });
});

describe("POST /api/auth/logout", () => {
  it("retorna 200 e limpa cookie de sessão", async () => {
    const res = await logoutPost();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toBe("Desconectado com sucesso");
    // Check cookie is deleted (Max-Age=0 or Expires in past)
    const cookies = res.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.startsWith("icewall_session="));
    expect(sessionCookie).toBeDefined();
    // Cookie deletion should have Max-Age=0 or Expires in past
    expect(sessionCookie!.includes("Max-Age=0") || sessionCookie!.includes("Expires=")).toBe(true);
  });
});

// Need to import eq for the beforeEach
import { eq } from "drizzle-orm";
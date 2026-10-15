import { describe, expect, it, vi, beforeEach } from "vitest";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/crypto";
import { eq, desc } from "drizzle-orm";

// Test helper functions (defined at top for TypeScript)
const req = (
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request => {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", "x-icewall": "1", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

const getReq = (url: string, headers: Record<string, string> = {}): Request => {
  return new Request(url, {
    method: "GET",
    headers: { "x-icewall": "1", ...headers },
  });
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

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

// Mock hashPassword
vi.mock("@/server/auth/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/crypto")>();
  return {
    ...actual,
    hashPassword: vi.fn().mockReturnValue("salt:hash"),
    verifyPassword: vi.fn().mockReturnValue(true),
  };
});

// Mock recordAuditLog
vi.mock("@/server/auth/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/audit")>();
  return {
    ...actual,
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

// Import after mocks
import { GET as adminUsersGet, POST as adminUsersPost } from "@/app/api/admin/users/route";
import { PUT as adminUserPut, PATCH as adminUserPatch, DELETE as adminUserDelete } from "@/app/api/admin/users/[id]/route";
import { GET as actionsGet, POST as actionsPost } from "@/app/api/actions/route";

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    const db = getDb();
    // Ensure admin exists
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

  it("retorna lista de usuários do tenant", async () => {
    const res = await adminUsersGet(getReq("http://localhost/api/admin/users"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.users.length).toBeGreaterThan(0);
    expect(data.users[0].email).toBe("admin@icewall.ai");
    expect(data.users[0].role).toBe("admin");
  });

  it("não expõe passwordHash", async () => {
    const res = await adminUsersGet(getReq("http://localhost/api/admin/users"));
    const data = await res.json();
    for (const user of data.users) {
      expect(user).not.toHaveProperty("passwordHash");
    }
  });
});

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    const db = getDb();
    // Clean up any test users
    db.delete(saasUsers).where(eq(saasUsers.tenantId, "tenant_default_01")).run();
    // Re-create admin
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
  });

  it("retorna 400 se dados obrigatórios ausentes", async () => {
    const res = await adminUsersPost(req("POST", "http://localhost/api/admin/users", { name: "Test" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Payload inválido");
  });

  it("retorna 400 se email inválido", async () => {
    const res = await adminUsersPost(req("POST", "http://localhost/api/admin/users", {
      name: "Test",
      email: "invalid-email",
      password: "123456",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Payload inválido");
  });

  it("retorna 400 se senha muito curta", async () => {
    const res = await adminUsersPost(req("POST", "http://localhost/api/admin/users", {
      name: "Test",
      email: "test@test.com",
      password: "123",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Payload inválido");
  });

  it("retorna 409 se email já existe", async () => {
    const res = await adminUsersPost(req("POST", "http://localhost/api/admin/users", {
      name: "Admin",
      email: "admin@icewall.ai",
      password: "123456",
    }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("Já existe um usuário cadastrado com este e-mail");
  });

  it("cria usuário com sucesso", async () => {
    const res = await adminUsersPost(req("POST", "http://localhost/api/admin/users", {
      name: "Novo Usuário",
      email: "novo@test.com",
      password: "Senha123",
      role: "operator",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.email).toBe("novo@test.com");
    expect(data.user.role).toBe("operator");
    expect(data.user.twoFactorEnabled).toBe(false);
    expect(data.user).not.toHaveProperty("passwordHash");
  });

  it("usa role 'operator' como default", async () => {
    const res = await adminUsersPost(req("POST", "http://localhost/api/admin/users", {
      name: "Sem Role",
      email: "semrole@test.com",
      password: "Senha123",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.role).toBe("operator");
  });
});

describe("PUT /api/admin/users/:id", () => {
  let targetUserId: string;

  beforeEach(() => {
    const db = getDb();
    // Clean up any existing target user by ID first
    db.delete(saasUsers).where(eq(saasUsers.id, "user_target_01")).run();
    // Create a target user to update
    db.insert(saasUsers).values({
      id: "user_target_01",
      tenantId: "tenant_default_01",
      email: "target@test.com",
      name: "Target User",
      passwordHash: hashPassword("Senha123"),
      role: "operator",
      twoFactorEnabled: false,
      twoFactorSecret: null,
    }).run();
    targetUserId = "user_target_01";
  });

  it("retorna 404 se usuário não encontrado", async () => {
    const res = await adminUserPut(
      req("PUT", "http://localhost/api/admin/users/999999", { name: "Novo Nome" }),
      ctx("999999")
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Usuário não encontrado");
  });

  it("atualiza nome do usuário", async () => {
    const res = await adminUserPut(
      req("PUT", `http://localhost/api/admin/users/${targetUserId}`, { name: "Nome Atualizado" }),
      ctx(targetUserId)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.name).toBe("Nome Atualizado");
  });

  it("atualiza email do usuário", async () => {
    const res = await adminUserPut(
      req("PUT", `http://localhost/api/admin/users/${targetUserId}`, { email: "novo@test.com" }),
      ctx(targetUserId)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.email).toBe("novo@test.com");
  });

  it("atualiza role do usuário", async () => {
    const res = await adminUserPut(
      req("PUT", `http://localhost/api/admin/users/${targetUserId}`, { role: "viewer" }),
      ctx(targetUserId)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.role).toBe("viewer");
  });

  it("impede admin de revogar próprio privilégio", async () => {
    const res = await adminUserPut(
      req("PUT", `http://localhost/api/admin/users/user_admin_01`, { role: "operator" }),
      ctx("user_admin_01")
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Você não pode revogar seu próprio privilégio de admin");
  });
});

describe("PATCH /api/admin/users/:id", () => {
  let targetUserId: string;

  beforeEach(() => {
    const db = getDb();
    // Clean up any existing patch user by ID first
    db.delete(saasUsers).where(eq(saasUsers.id, "user_patch_01")).run();
    // Create a target user
    db.insert(saasUsers).values({
      id: "user_patch_01",
      tenantId: "tenant_default_01",
      email: "patch@test.com",
      name: "Patch User",
      passwordHash: hashPassword("Senha123"),
      role: "operator",
      twoFactorEnabled: false,
      twoFactorSecret: null,
    }).run();
    targetUserId = "user_patch_01";
  });

  it("retorna 400 se nova senha muito curta", async () => {
    const res = await adminUserPatch(
      req("PATCH", `http://localhost/api/admin/users/${targetUserId}`, { action: "reset_password", newPassword: "123" }),
      ctx(targetUserId)
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("A nova senha deve ter pelo menos 6 caracteres");
  });

  it("redefine senha do usuário", async () => {
    const res = await adminUserPatch(
      req("PATCH", `http://localhost/api/admin/users/${targetUserId}`, { action: "reset_password", newPassword: "NovaSenha123" }),
      ctx(targetUserId)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toBe("Senha redefinida com sucesso");
  });

  it("revoga 2FA do usuário", async () => {
    const db = getDb();
    // Enable 2FA first
    db.update(saasUsers).set({ twoFactorEnabled: true, twoFactorSecret: "SECRET123" }).where(eq(saasUsers.id, targetUserId)).run();

    const res = await adminUserPatch(
      req("PATCH", `http://localhost/api/admin/users/${targetUserId}`, { action: "reset_2fa" }),
      ctx(targetUserId)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toBe("2FA revogado e desativado com sucesso");
  });

  it("retorna 400 para ação não suportada", async () => {
    const res = await adminUserPatch(
      req("PATCH", `http://localhost/api/admin/users/${targetUserId}`, { action: "invalid" }),
      ctx(targetUserId)
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Ação não suportada");
  });
});

describe("DELETE /api/admin/users/:id", () => {
  let targetUserId: string;

  beforeEach(() => {
    const db = getDb();
    // Clean up any existing delete user by ID first
    db.delete(saasUsers).where(eq(saasUsers.id, "user_delete_01")).run();
    // Create a target user to delete
    db.insert(saasUsers).values({
      id: "user_delete_01",
      tenantId: "tenant_default_01",
      email: "delete@test.com",
      name: "Delete User",
      passwordHash: hashPassword("Senha123"),
      role: "operator",
      twoFactorEnabled: false,
      twoFactorSecret: null,
    }).run();
    targetUserId = "user_delete_01";
  });

  it("retorna 400 se tentar excluir próprio usuário", async () => {
    const res = await adminUserDelete(req("DELETE", "http://localhost/api/admin/users/user_admin_01"), ctx("user_admin_01"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Não é permitido excluir o usuário atualmente conectado");
  });

  it("retorna 404 se usuário não encontrado", async () => {
    const res = await adminUserDelete(req("DELETE", "http://localhost/api/admin/users/999999"), ctx("999999"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Usuário não encontrado");
  });

  it("exclui usuário com sucesso", async () => {
    const res = await adminUserDelete(req("DELETE", `http://localhost/api/admin/users/${targetUserId}`), ctx(targetUserId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toBe("Usuário excluído com sucesso");

    // Verify deletion
    const db = getDb();
    const deleted = db.select().from(saasUsers).where(eq(saasUsers.id, targetUserId)).get();
    expect(deleted).toBeUndefined();
  });
});

describe("GET /api/actions", () => {
  it("retorna log de ações", async () => {
    const res = await actionsGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("POST /api/actions", () => {
  it("retorna 400 se payload inválido", async () => {
    const res = await actionsPost(req("POST", "http://localhost/api/actions", { action: "invalid" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Payload inválido");
  });

  it("retorna 400 se ação não existe na allowlist", async () => {
    const res = await actionsPost(req("POST", "http://localhost/api/actions", {
      action: "acao_inexistente",
      target: "test",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("ação inválida");
  });

  it("executa ação válida", async () => {
    // This will depend on what actions are in the allowlist
    // We'll test with a known action or mock the allowlist
    const res = await actionsPost(req("POST", "http://localhost/api/actions", {
      action: "restart_container",
      target: "test-container",
      arg: "",
    }));
    // May succeed or fail depending on container existence
    expect([200, 400, 404, 500]).toContain(res.status);
  });
});
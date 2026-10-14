import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db/client";
import { servers } from "@/server/db/schema";
import { serverIdByName } from "@/server/executor";

// Em teste unitário não há request scope do Next: `connection()` vira no-op e a sessão é simulada.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getSession: vi.fn().mockResolvedValue({ userId: "teste", tenantId: "tenant_teste" }),
  };
});

import { POST } from "./route";

/**
 * Testes do terminal multi-servidor (Etapa 04): /api/terminal/exec resolve o
 * servidor pelo registro (serverId) — nunca um host constante.
 */

function execReq(payload: unknown): Request {
  return new Request("http://localhost/api/terminal/exec", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/terminal/exec — resolução pelo registro", () => {
  it("executa no servidor indicado por serverId (Station local, pelo driver)", async () => {
    const res = await POST(execReq({ command: "echo via registro", serverId: serverIdByName("Station") }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.output).toBe("via registro\n");
    expect(body.exitCode).toBe(0);
    expect(body.server.id).toBe(serverIdByName("Station"));
    expect(body.server.tipo).toBe("local");
  });

  it("sem serverId, o padrão é o servidor local (Station)", async () => {
    const res = await POST(execReq({ command: "echo padrao local" }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.output).toBe("padrao local\n");
    expect(body.server.id).toBe(serverIdByName("Station"));
  });

  it("serverId inexistente → erro claro (404), sem execução", async () => {
    const res = await POST(execReq({ command: "rm -rf /", serverId: 999_999 }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.output).toContain("servidor inexistente no registro: id 999999");
  });

  it("comando ausente → 400", async () => {
    const res = await POST(execReq({ serverId: serverIdByName("Station") }));
    expect(res.status).toBe(400);
  });

  it("registro vazio e sem serverId → erro claro", async () => {
    getDb().delete(servers).run();
    const res = await POST(execReq({ command: "true" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.output).toContain("nenhum servidor cadastrado no registro");
  });
});

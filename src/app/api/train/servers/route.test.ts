import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db/client";

// Em teste unitário não há request scope do Next: `connection()` vira no-op.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

import { servers } from "@/server/db/schema";
import { GET as listGet, POST } from "./route";
import { GET as detailGet, PUT, DELETE } from "./[id]/route";
import type { SafeServer } from "./schemas";

/**
 * Testes do registro central de servidores (Etapa 01 do plano multi-servidor).
 * O setup de vitest aponta ICEWALL_DB para ":memory:" — cada arquivo ganha um
 * banco em memória já migrado e com o seed de Station + Spark.
 */

function req(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const SAFE_KEYS = new Set([
  "id",
  "nome",
  "tipo",
  "host",
  "porta",
  "usuario",
  "vllmUrl",
  "capacidades",
  "ultimoStatus",
  "ultimoCheck",
  "criadoEm",
  "atualizadoEm",
]);

function assertNoSecrets(s: unknown): void {
  const obj = s as Record<string, unknown>;
  expect("chaveSshPath" in obj).toBe(false);
  expect("vllmKey" in obj).toBe(false);
  for (const key of Object.keys(obj)) {
    expect(SAFE_KEYS.has(key), `campo inesperado na resposta: ${key}`).toBe(true);
  }
}

describe("GET /api/train/servers (listagem)", () => {
  it("seed automático cria Station (local) e Spark (ssh)", async () => {
    const res = await listGet();
    const data = (await res.json()) as { ok: boolean; servers: SafeServer[] };
    expect(data.ok).toBe(true);
    const byNome = Object.fromEntries(data.servers.map((s) => [s.nome, s]));
    expect(byNome.Station.tipo).toBe("local");
    expect(byNome.Spark.tipo).toBe("ssh");
    expect(byNome.Spark.host).toBe("10.0.5.18");
    expect(byNome.Spark.usuario).toBe("facini");
  });

  it("nenhum servidor expõe chaveSshPath/vllmKey", async () => {
    const data = (await (await listGet()).json()) as { servers: unknown[] };
    expect(data.servers.length).toBeGreaterThanOrEqual(2);
    for (const s of data.servers) assertNoSecrets(s);
  });
});

describe("POST /api/train/servers", () => {
  const MUTATION = { "x-icewall": "1" };

  it("sem header x-icewall retorna 403", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/servers", { nome: "Bloqueado", tipo: "local" }),
    );
    expect(res.status).toBe(403);
  });

  it("rejeita tipo inválido (o antigo 'spark' não é mais aceito)", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/servers", { nome: "Srv", tipo: "spark", host: "10.0.0.9", usuario: "u" }, MUTATION),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("validacao_erro");
  });

  it("rejeita servidor SSH sem chaveSshPath", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/servers", { nome: "Srv", tipo: "ssh", host: "10.0.0.9", usuario: "u" }, MUTATION),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { details: Record<string, string[] | undefined> };
    expect(data.details.chaveSshPath).toBeDefined();
  });

  it("cria servidor local sem campos SSH e não devolve segredos", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/servers", { nome: "Workstation 02", tipo: "local" }, MUTATION),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { server: SafeServer };
    expect(data.server.tipo).toBe("local");
    expect(data.server.host).toBe("localhost");
    assertNoSecrets(data.server);
  });

  it("guarda chaveSshPath/vllmKey no banco mas nunca nas respostas", async () => {
    const res = await POST(
      req(
        "POST",
        "http://localhost/api/train/servers",
        {
          nome: "Remoto 01",
          tipo: "ssh",
          host: "10.0.0.9",
          porta: 22,
          usuario: "tester",
          chaveSshPath: "/tmp/chave-teste",
          vllmKey: "chave-vllm-secret",
        },
        MUTATION,
      ),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { server: SafeServer };
    assertNoSecrets(data.server);

    // Detalhe (GET por id) também não expõe:
    const detail = (await (await detailGet(req("GET", `http://localhost/api/train/servers/${data.server.id}`), ctx(String(data.server.id)))).json()) as { server: SafeServer };
    assertNoSecrets(detail.server);

    // Mas o valor foi de fato gravado (leitura direta no banco, fora do GET):
    const row = getDb().select().from(servers).limit(100).all().find((s) => s.nome === "Remoto 01");
    expect(row?.chaveSshPath).toBe("/tmp/chave-teste");
    expect(row?.vllmKey).toBe("chave-vllm-secret");
  });

  it("rejeita nome duplicado com 409", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/servers", { nome: "Station", tipo: "local" }, MUTATION),
    );
    expect(res.status).toBe(409);
  });
});

describe("PUT /api/train/servers/:id", () => {
  const MUTATION = { "x-icewall": "1" };

  async function withRemoto01(): Promise<number> {
    const list = (await (await listGet()).json()) as { servers: SafeServer[] };
    const row = list.servers.find((s) => s.nome === "Remoto 01");
    expect(row, "Remoto 01 precisa existir (testes rodam em sequência)").toBeDefined();
    return row!.id;
  }

  it("sem header x-icewall retorna 403", async () => {
    const id = await withRemoto01();
    const res = await PUT(req("PUT", `http://localhost/api/train/servers/${id}`, { vllmUrl: "http://x" }, {}), ctx(String(id)));
    expect(res.status).toBe(403);
  });

  it("converte local para SSH incompleto → 400 campos_ssh_incompletos", async () => {
    const list = (await (await listGet()).json()) as { servers: SafeServer[] };
    const station = list.servers.find((s) => s.nome === "Station");
    expect(station).toBeDefined();
    const res = await PUT(
      req("PUT", `http://localhost/api/train/servers/${station!.id}`, { tipo: "ssh" }, MUTATION),
      ctx(String(station!.id)),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("campos_ssh_incompletos");
  });

  it("atualiza campos (vllmUrl) e mantém resposta sem segredos", async () => {
    const id = await withRemoto01();
    const res = await PUT(
      req("PUT", `http://localhost/api/train/servers/${id}`, { vllmUrl: "http://10.0.0.9:8001" }, MUTATION),
      ctx(String(id)),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { server: SafeServer };
    expect(data.server.vllmUrl).toBe("http://10.0.0.9:8001");
    assertNoSecrets(data.server);
  });

  it("id inexistente → 404", async () => {
    const res = await PUT(req("PUT", "http://localhost/api/train/servers/999999", { vllmUrl: "http://x" }, MUTATION), ctx("999999"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/train/servers/:id (detalhe) e DELETE", () => {
  const MUTATION = { "x-icewall": "1" };

  it("id inválido → 400", async () => {
    const res = await detailGet(req("GET", "http://localhost/api/train/servers/abc"), ctx("abc"));
    expect(res.status).toBe(400);
  });

  it("id inexistente → 404", async () => {
    const res = await detailGet(req("GET", "http://localhost/api/train/servers/999999"), ctx("999999"));
    expect(res.status).toBe(404);
  });

  it("DELETE sem x-icewall retorna 403", async () => {
    const list = (await (await listGet()).json()) as { servers: SafeServer[] };
    const id = list.servers.find((s) => s.nome === "Remoto 01")!.id;
    const res = await DELETE(req("DELETE", `http://localhost/api/train/servers/${id}`), ctx(String(id)));
    expect(res.status).toBe(403);
  });

  it("DELETE remove o servidor (e o detalhe passa a dar 404)", async () => {
    const list = (await (await listGet()).json()) as { servers: SafeServer[] };
    const id = list.servers.find((s) => s.nome === "Remoto 01")!.id;
    const res = await DELETE(req("DELETE", `http://localhost/api/train/servers/${id}`, undefined, MUTATION), ctx(String(id)));
    expect(res.status).toBe(200);
    const detail = await detailGet(req("GET", `http://localhost/api/train/servers/${id}`), ctx(String(id)));
    expect(detail.status).toBe(404);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";

// Sem request scope do Next em teste unitário: `connection()` vira no-op.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

// withAuth lê cookies() e verifica a sessão: sessão autenticada de teste.
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
  };
});

// Nenhuma rede/SFTP em teste: driver falso e execOnServer sob controle.
vi.mock("@/server/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/executor")>();
  return {
    ...actual,
    driverFor: vi.fn(),
    execOnServer: vi.fn(),
  };
});

import type { ServerDriver } from "@/lib/servers/server-driver";
import type { ExecResult } from "@/lib/servers/server-driver";
import { driverFor, execOnServer } from "@/server/executor";
import { servers, trainDatasets, trainJobs } from "@/server/db/schema";
import { DELETE, GET as detailGet } from "./[id]/route";
import { GET as previewGet } from "./[id]/preview/route";
import { GET as listGet, POST } from "./route";
import type { SafeTrainDataset } from "./schemas";

/**
 * Testes de contrato dos datasets (Etapa T1). O setup aponta ICEWALL_DB para
 * ":memory:" — banco já migrado, com o seed de Station + Spark. O driver é
 * falso: nada toca o Spark de verdade.
 */

const driverForMock = vi.mocked(driverFor);
const execMock = vi.mocked(execOnServer);

const driverFalso = {
  mkdir: vi.fn(async () => undefined),
  put: vi.fn(async () => undefined),
  close: vi.fn(),
} as unknown as ServerDriver & { put: ReturnType<typeof vi.fn> };

const EXEC_OK: ExecResult = { code: 0, stdout: "", stderr: "", ms: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  driverForMock.mockReturnValue(driverFalso);
  execMock.mockResolvedValue(EXEC_OK);
});

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const MUTATION = { "x-icewall": "1" };

async function sparkId(): Promise<number> {
  const row = getDb().select().from(servers).all().find((s) => s.nome === "Spark");
  expect(row, "seed do Spark precisa existir").toBeDefined();
  return row!.id;
}

function formDe(dados: Record<string, string>, arquivo?: { nome: string; conteudo: string }): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(dados)) form.set(k, v);
  if (arquivo) form.set("arquivo", new File([arquivo.conteudo], arquivo.nome, { type: "text/plain" }));
  return form;
}

async function post(form: FormData, headers: Record<string, string> = MUTATION): Promise<Response> {
  return POST(new Request("http://localhost/api/train/datasets", { method: "POST", headers, body: form }));
}

describe("GET /api/train/datasets", () => {
  it("lista registrada, filtrando por servidor", async () => {
    const res = await listGet(req("GET", "http://localhost/api/train/datasets"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; datasets: SafeTrainDataset[] };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.datasets)).toBe(true);
  });

  it("rejeita query inválida com 400", async () => {
    const res = await listGet(req("GET", "http://localhost/api/train/datasets?serverId=abc"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/train/datasets (upload multipart)", () => {
  it("sem header x-icewall retorna 403", async () => {
    const res = await post(formDe({ serverId: "1" }, { nome: "a.jsonl", conteudo: '{"text":"x"}' }), {});
    expect(res.status).toBe(403);
  });

  it("sem arquivo retorna 400", async () => {
    const res = await post(formDe({ serverId: "1" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("arquivo_ausente");
  });

  it("formato não suportado retorna 400 formato_invalido", async () => {
    const sid = await sparkId();
    const res = await post(formDe({ serverId: String(sid) }, { nome: "dados.parquet", conteudo: "x" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("formato_invalido");
  });

  it("arquivo sem amostras válidas retorna 400 sem_amostras", async () => {
    const sid = await sparkId();
    const res = await post(formDe({ serverId: String(sid) }, { nome: "vazio.txt", conteudo: "   \n  " }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("sem_amostras");
  });

  it("servidor fora do registro retorna 400", async () => {
    const res = await post(formDe({ serverId: "999999" }, { nome: "a.jsonl", conteudo: '{"text":"x"}' }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("servidor_inexistente");
  });

  it("jsonl válido: converte, envia pelo driver e registra com validação", async () => {
    const sid = await sparkId();
    const conteudo = [
      JSON.stringify({ instruction: "A", output: "B" }),
      "linha quebrada",
      JSON.stringify({ instruction: "A", output: "B" }),
      JSON.stringify({ instruction: "C", output: "D" }),
    ].join("\n");
    const res = await post(
      formDe({ serverId: String(sid), formatoTreino: "chat" }, { nome: "Receitas de Teste.jsonl", conteudo }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { dataset: SafeTrainDataset; validacao: { total: number; duplicados: number; vazios: number } };
    expect(data.dataset.nome).toBe("receitas-de-teste");
    expect(data.dataset.remotePath).toBe("/mnt/data/datasets/receitas-de-teste.jsonl");
    expect(data.dataset.formato).toBe("jsonl");
    expect(data.dataset.formatoTreino).toBe("chat");
    expect(data.validacao).toEqual({ total: 2, duplicados: 1, vazios: 1 });
    expect(driverFalso.mkdir).toHaveBeenCalledWith("/mnt/data/datasets", "755");
    expect(driverFalso.put).toHaveBeenCalledTimes(1);
    const row = getDb().select().from(trainDatasets).all().find((d) => d.nome === "receitas-de-teste");
    expect(row?.serverId).toBe(sid);
    expect(row?.samples).toBe(2);
  });

  it("csv válido converte para chat (instruction/output)", async () => {
    const sid = await sparkId();
    const res = await post(
      formDe({ serverId: String(sid) }, { nome: "faq.csv", conteudo: "instruction,output\nP1,R1\nP2,R2\n" }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { dataset: SafeTrainDataset };
    expect(data.dataset.formato).toBe("csv");
    expect(data.dataset.samples).toBe(2);
  });

  it("nome duplicado no mesmo servidor retorna 409", async () => {
    const sid = await sparkId();
    const form = formDe({ serverId: String(sid) }, { nome: "duplicado.jsonl", conteudo: '{"text":"x"}\n' });
    expect((await post(form)).status).toBe(201);
    const res = await post(formDe({ serverId: String(sid) }, { nome: "duplicado.txt", conteudo: "x\n" }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("nome_duplicado");
  });
});

describe("GET/DELETE /api/train/datasets/:id", () => {
  async function datasetDireto(sid: number, nome: string): Promise<number> {
    return getDb()
      .insert(trainDatasets)
      .values({ serverId: sid, nome, formato: "jsonl", remotePath: `/mnt/data/datasets/${nome}.jsonl`, samples: 1 })
      .returning()
      .get()!.id;
  }

  it("detalhe devolve o dataset; id inválido → 400; inexistente → 404", async () => {
    const sid = await sparkId();
    const id = await datasetDireto(sid, "detalhe");
    const res = await detailGet(req("GET", `http://localhost/api/train/datasets/${id}`), ctx(String(id)));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { dataset: SafeTrainDataset };
    expect(data.dataset.nome).toBe("detalhe");
    expect((await detailGet(req("GET", "http://localhost/api/train/datasets/abc"), ctx("abc"))).status).toBe(400);
    expect((await detailGet(req("GET", "http://localhost/api/train/datasets/999999"), ctx("999999"))).status).toBe(404);
  });

  it("DELETE remove o arquivo remoto (exec) e o registro", async () => {
    const sid = await sparkId();
    const id = await datasetDireto(sid, "removivel");
    const res = await DELETE(req("DELETE", `http://localhost/api/train/datasets/${id}`, undefined, MUTATION), ctx(String(id)));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { remotePath: string };
    expect(data.remotePath).toBe("/mnt/data/datasets/removivel.jsonl");
    expect(execMock).toHaveBeenCalledTimes(1);
    expect(String(execMock.mock.calls[0][1])).toContain("rm -f");
    expect(getDb().select().from(trainDatasets).where(eq(trainDatasets.id, id)).get()).toBeUndefined();
  });

  it("DELETE bloqueia quando um job na fila usa o dataset (409 em_uso)", async () => {
    const sid = await sparkId();
    const id = await datasetDireto(sid, "em-uso");
    getDb()
      .insert(trainJobs)
      .values({ serverId: sid, baseModel: "m", method: "lora", datasetId: id, datasetPath: "/mnt/data/datasets/em-uso.jsonl", status: "queued" })
      .run();
    const res = await DELETE(req("DELETE", `http://localhost/api/train/datasets/${id}`, undefined, MUTATION), ctx(String(id)));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("em_uso");
  });

  it("DELETE sem header x-icewall retorna 403; inexistente → 404", async () => {
    const sid = await sparkId();
    const id = await datasetDireto(sid, "sem-header");
    expect((await DELETE(req("DELETE", `http://localhost/api/train/datasets/${id}`), ctx(String(id)))).status).toBe(403);
    expect((await DELETE(req("DELETE", "http://localhost/api/train/datasets/999999", undefined, MUTATION), ctx("999999"))).status).toBe(404);
  });
});

describe("GET /api/train/datasets/:id/preview", () => {
  it("devolve as primeiras amostras parseadas do arquivo remoto", async () => {
    const sid = await sparkId();
    const id = getDb()
      .insert(trainDatasets)
      .values({ serverId: sid, nome: "preview", formato: "jsonl", remotePath: "/mnt/data/datasets/preview.jsonl", samples: 2 })
      .returning()
      .get()!.id;
    execMock.mockResolvedValue({
      code: 0,
      stdout: `${JSON.stringify({ text: "a" })}\n${JSON.stringify({ text: "b" })}\n`,
      stderr: "",
      ms: 1,
    });
    const res = await previewGet(req("GET", `http://localhost/api/train/datasets/${id}/preview?quantidade=2`), ctx(String(id)));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; nome: string; amostras: unknown[] };
    expect(data.ok).toBe(true);
    expect(data.nome).toBe("preview");
    expect(data.amostras).toEqual([{ text: "a" }, { text: "b" }]);
  });

  it("dataset inexistente → 404; falha remota → 502", async () => {
    expect((await previewGet(req("GET", "http://localhost/api/train/datasets/999999/preview"), ctx("999999"))).status).toBe(404);
    const sid = await sparkId();
    const id = getDb()
      .insert(trainDatasets)
      .values({ serverId: sid, nome: "falha", formato: "jsonl", remotePath: "/mnt/data/datasets/falha.jsonl" })
      .returning()
      .get()!.id;
    execMock.mockResolvedValue({ code: 1, stdout: "", stderr: "head: arquivo sumiu", ms: 1 });
    const res = await previewGet(req("GET", `http://localhost/api/train/datasets/${id}/preview`), ctx(String(id)));
    expect(res.status).toBe(502);
  });
});

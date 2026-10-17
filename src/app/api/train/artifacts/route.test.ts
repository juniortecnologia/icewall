import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import { getDb, schema } from "@/server/db/client";

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

// Nenhuma rede: driver falso (get escreve o arquivo local) e exec sob controle.
vi.mock("@/server/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/executor")>();
  return { ...actual, driverFor: vi.fn(), execOnServer: vi.fn() };
});

import type { ServerDriver } from "@/lib/servers/server-driver";
import type { ExecResult } from "@/lib/servers/server-driver";
import { driverFor, execOnServer } from "@/server/executor";
import { servers, trainArtifacts, trainJobs } from "@/server/db/schema";
import { GET as listGet } from "./route";
import { DELETE, GET as detailGet } from "./[id]/route";
import { GET as downloadGet } from "./[id]/download/route";
import { POST as exportPost } from "../jobs/[id]/export/route";
import type { SafeTrainArtifact } from "./schemas";

/**
 * Contratos dos artifacts (T3): POST export em jobs/:id/export, listagem,
 * download (driver.get) e remoção. O driver é falso; nada toca o Spark.
 */

const driverForMock = vi.mocked(driverFor);
const execMock = vi.mocked(execOnServer);

const driverFalso = {
  mkdir: vi.fn(async () => undefined),
  put: vi.fn(async () => undefined),
  // get "baixa" escrevendo o arquivo local — o download streama esse conteúdo.
  get: vi.fn(async (_remoto: string, local: string) => {
    fs.writeFileSync(local, "conteudo-gguf-falso");
  }),
  close: vi.fn(),
} as unknown as ServerDriver & { get: ReturnType<typeof vi.fn> };

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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const MUTATION = { "x-icewall": "1" };

async function sparkId(): Promise<number> {
  const row = getDb().select().from(servers).all().find((s) => s.nome === "Spark");
  expect(row, "seed do Spark precisa existir").toBeDefined();
  return row!.id;
}

const PARAMS = {
  learningRate: 2e-4,
  epochs: 1,
  r: 8,
  alpha: 16,
  dropout: 0,
  batchSize: 2,
  gradientAccumulationSteps: 1,
  maxSeqLength: 256,
  bf16: true,
};

async function jobComStatus(sid: number, status: "done" | "running", sufixo: string): Promise<number> {
  return getDb()
    .insert(trainJobs)
    .values({
      serverId: sid,
      baseModel: "HuggingFaceTB/SmolLM2-135M",
      method: "lora",
      datasetPath: "/home/facini/icewall/datasets/ds.jsonl",
      status,
      workspacePath: `/home/facini/icewall/workspaces/train-${sufixo}`,
      finishedAt: status === "done" ? Date.now() : null,
      paramsJson: PARAMS,
    })
    .returning()
    .get()!.id;
}

function artifactDireto(sid: number, jobId: number, status: SafeTrainArtifact["status"], quant: string | null, kind: SafeTrainArtifact["kind"] = "gguf"): number {
  return getDb()
    .insert(trainArtifacts)
    .values({
      jobId,
      serverId: sid,
      kind,
      quant,
      remotePath: quant ? `/home/facini/icewall/workspaces/export-${quant}/gguf-${quant}.gguf` : `/home/facini/icewall/workspaces/out/adapter`,
      status,
      sizeBytes: status === "done" && kind === "gguf" ? 1234 : null,
    })
    .returning()
    .get()!.id;
}

describe("POST /api/train/jobs/:id/export", () => {
  it("sem header x-icewall retorna 403", async () => {
    const res = await exportPost(req("POST", "http://localhost/api/train/jobs/1/export", { quant: "q4_k_m" }), ctx("1"));
    expect(res.status).toBe(403);
  });

  it("quant inválida → 400; job inexistente → 404", async () => {
    expect((await exportPost(req("POST", "http://localhost/api/train/jobs/1/export", { quant: "q9_zzz" }, MUTATION), ctx("1"))).status).toBe(400);
    expect((await exportPost(req("POST", "http://localhost/api/train/jobs/999999/export", { quant: "f16" }, MUTATION), ctx("999999"))).status).toBe(404);
  });

  it("job não concluído → 400 job_nao_concluido", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "running", "nao-concluido");
    const res = await exportPost(req("POST", `http://localhost/api/train/jobs/${jobId}/export`, { quant: "f16" }, MUTATION), ctx(String(jobId)));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("job_nao_concluido");
  });

  it("job done → 201 com artifact pending e caminho esperado", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "export-ok");
    const res = await exportPost(req("POST", `http://localhost/api/train/jobs/${jobId}/export`, { quant: "q4_k_m" }, MUTATION), ctx(String(jobId)));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { artifact: SafeTrainArtifact };
    expect(data.artifact.status).toBe("pending");
    expect(data.artifact.kind).toBe("gguf");
    expect(data.artifact.quant).toBe("q4_k_m");
    expect(data.artifact.remotePath).toBe(`/home/facini/icewall/workspaces/train-export-ok/export-q4_k_m/gguf-q4_k_m.gguf`);
  });

  it("export duplicado ativo (pending/running) para o mesmo job+quant → 409", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "duplicado");
    expect((await exportPost(req("POST", `http://localhost/api/train/jobs/${jobId}/export`, { quant: "q8_0" }, MUTATION), ctx(String(jobId)))).status).toBe(201);
    const res = await exportPost(req("POST", `http://localhost/api/train/jobs/${jobId}/export`, { quant: "q8_0" }, MUTATION), ctx(String(jobId)));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("export_em_andamento");
  });
});

describe("GET /api/train/artifacts", () => {
  it("lista com filtro por servidor e sem campos inesperados", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "lista");
    artifactDireto(sid, jobId, "done", "f16");
    const res = await listGet(req("GET", `http://localhost/api/train/artifacts?serverId=${sid}`));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; artifacts: SafeTrainArtifact[] };
    expect(data.ok).toBe(true);
    expect(data.artifacts.length).toBeGreaterThan(0);
    const campos = new Set(Object.keys(data.artifacts[0]));
    expect(campos.has("remotePath")).toBe(true);
    expect(campos.has("chaveSshPath")).toBe(false);
  });
});

describe("GET /api/train/artifacts/:id/download", () => {
  it("pending → 409; inexistente → 404; id inválido → 400", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "dl-pendente");
    const pendente = artifactDireto(sid, jobId, "pending", "f16");
    expect((await downloadGet(req("GET", `http://localhost/api/train/artifacts/${pendente}/download`), ctx(String(pendente)))).status).toBe(409);
    expect((await downloadGet(req("GET", "http://localhost/api/train/artifacts/999999/download"), ctx("999999"))).status).toBe(404);
    expect((await downloadGet(req("GET", "http://localhost/api/train/artifacts/abc/download"), ctx("abc"))).status).toBe(400);
  });

  it("done → 200 com content-disposition e o conteúdo trazido pelo driver", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "dl-ok");
    const id = artifactDireto(sid, jobId, "done", "q4_k_m");
    const res = await downloadGet(req("GET", `http://localhost/api/train/artifacts/${id}/download`), ctx(String(id)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(".gguf");
    expect(await res.text()).toBe("conteudo-gguf-falso");
    expect(driverFalso.get).toHaveBeenCalledTimes(1);
  });

  it("driver falha → 502 remoto", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "dl-erro");
    const id = artifactDireto(sid, jobId, "done", "q8_0");
    driverFalso.get.mockRejectedValueOnce(new Error("scp get failed (1)"));
    const res = await downloadGet(req("GET", `http://localhost/api/train/artifacts/${id}/download`), ctx(String(id)));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("remoto");
  });
});

describe("DELETE /api/train/artifacts/:id", () => {
  it("pending/running → 409 em_andamento", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "del-pendente");
    const pendente = artifactDireto(sid, jobId, "pending", "f16");
    const res = await DELETE(req("DELETE", `http://localhost/api/train/artifacts/${pendente}`, undefined, MUTATION), ctx(String(pendente)));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("em_andamento");
  });

  it("done → 200, rm -rf remoto e registro removido", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "del-ok");
    const id = artifactDireto(sid, jobId, "done", "q4_k_m");
    const res = await DELETE(req("DELETE", `http://localhost/api/train/artifacts/${id}`, undefined, MUTATION), ctx(String(id)));
    expect(res.status).toBe(200);
    const chamouRm = execMock.mock.calls.some((c) => String(c[1]).includes("rm -rf"));
    expect(chamouRm).toBe(true);
    expect(getDb().select().from(trainArtifacts).where(eq(trainArtifacts.id, id)).get()).toBeUndefined();
  });

  it("sem header x-icewall → 403; inexistente → 404", async () => {
    const sid = await sparkId();
    const jobId = await jobComStatus(sid, "done", "del-403");
    const id = artifactDireto(sid, jobId, "done", "f16");
    expect((await DELETE(req("DELETE", `http://localhost/api/train/artifacts/${id}`), ctx(String(id)))).status).toBe(403);
    expect((await DELETE(req("DELETE", "http://localhost/api/train/artifacts/999999", undefined, MUTATION), ctx("999999"))).status).toBe(404);
  });
});

import { describe, expect, it, vi } from "vitest";
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

import { servers, trainDatasets, trainJobs } from "@/server/db/schema";
import { processTrainQueue, recoverStaleTrain } from "@/server/train/runner";
import { GET as listGet, POST } from "./route";
import { GET as detailGet } from "./[id]/route";
import { POST as stopPost } from "./[id]/stop/route";
import type { SafeTrainJob } from "./schemas";

/**
 * Testes da fila de treinos (Fase 2, Etapa T0). O setup de vitest aponta
 * ICEWALL_DB para ":memory:" — banco em memória já migrado, com o seed de
 * Station + Spark.
 */

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const MUTATION = { "x-icewall": "1" };

const SAFE_KEYS = new Set([
  "id",
  "ts",
  "serverId",
  "ambiente",
  "baseModel",
  "method",
  "datasetId",
  "datasetPath",
  "params",
  "status",
  "progressPct",
  "epochsDone",
  "totalEpochs",
  "lossHistory",
  "valLoss",
  "current",
  "error",
  "gpuMemUsedMib",
  "gpuMemTotalMib",
  "startedAt",
  "finishedAt",
]);

function assertSafeJob(job: unknown): void {
  const obj = job as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    expect(SAFE_KEYS.has(key), `campo inesperado na resposta: ${key}`).toBe(true);
  }
  expect("workspacePath" in obj).toBe(false);
  expect("remotePid" in obj).toBe(false);
}

async function sparkId(): Promise<number> {
  const row = getDb().select().from(servers).all().find((s) => s.nome === "Spark");
  expect(row, "seed do Spark precisa existir").toBeDefined();
  return row!.id;
}

describe("POST /api/train/jobs", () => {
  it("sem header x-icewall retorna 403", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/jobs", { serverId: 1, baseModel: "qwen3:8b", method: "lora", datasetPath: "/mnt/data/ds.jsonl" }),
    );
    expect(res.status).toBe(403);
  });

  it("rejeita payload inválido (baseModel malformado) com 400", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/jobs", { serverId: 1, baseModel: "modelo ruim; rm -rf", method: "lora", datasetPath: "/x.jsonl" }, MUTATION),
    );
    expect(res.status).toBe(400);
  });

  it("rejeita job sem dataset (datasetId ou datasetPath) com 400", async () => {
    const res = await POST(req("POST", "http://localhost/api/train/jobs", { serverId: 1, baseModel: "qwen3:8b", method: "lora" }, MUTATION));
    expect(res.status).toBe(400);
    // withAuth devolve validação genérica: { error } com a causa na mensagem.
    const data = (await res.json()) as { error?: string };
    expect(data.error).toContain("datasetId");
  });

  it("rejeita servidor fora do registro com 400", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/train/jobs", { serverId: 999999, baseModel: "qwen3:8b", method: "lora", datasetPath: "/x.jsonl" }, MUTATION),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("servidor_inexistente");
  });

  it("rejeita datasetId de outro servidor com 400", async () => {
    const sid = await sparkId();
    const station = getDb().select().from(servers).all().find((s) => s.nome === "Station")!;
    const dsId = getDb()
      .insert(trainDatasets)
      .values({ serverId: station.id, nome: "ds-outro", formato: "jsonl", remotePath: "/mnt/data/datasets/ds-outro.jsonl" })
      .returning()
      .get()!.id;
    const res = await POST(
      req("POST", "http://localhost/api/train/jobs", { serverId: sid, baseModel: "qwen3:8b", method: "lora", datasetId: dsId }, MUTATION),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("dataset_invalido");
  });

  it("cria job enfileirado com presets default (lab) e sem expor campos internos", async () => {
    const sid = await sparkId();
    const res = await POST(
      req(
        "POST",
        "http://localhost/api/train/jobs",
        { serverId: sid, baseModel: "qwen3:8b", method: "qlora", datasetPath: "/mnt/data/datasets/base.jsonl" },
        MUTATION,
      ),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { job: SafeTrainJob };
    assertSafeJob(data.job);
    expect(data.job.status).toBe("queued");
    expect(data.job.ambiente).toBe("lab");
    expect(data.job.totalEpochs).toBe(3);
    expect(data.job.params?.r).toBe(16);
    expect(data.job.params?.alpha).toBe(16);
    expect(data.job.params?.learningRate).toBeCloseTo(2e-4);
  });

  it("cria job com datasetId registrado resolvendo o caminho remoto", async () => {
    const sid = await sparkId();
    const dsId = getDb()
      .insert(trainDatasets)
      .values({ serverId: sid, nome: "receitas", formato: "jsonl", remotePath: "/mnt/data/datasets/receitas.jsonl", samples: 120 })
      .returning()
      .get()!.id;
    const res = await POST(
      req("POST", "http://localhost/api/train/jobs", { serverId: sid, baseModel: "qwen3:8b", method: "lora", datasetId: dsId, ambiente: "producao" }, MUTATION),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { job: SafeTrainJob };
    expect(data.job.datasetPath).toBe("/mnt/data/datasets/receitas.jsonl");
    expect(data.job.ambiente).toBe("producao");
  });
});

describe("GET /api/train/jobs", () => {
  it("lista jobs com filtros de status e ambiente", async () => {
    const res = await listGet(req("GET", "http://localhost/api/train/jobs?status=queued&ambiente=lab"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; jobs: SafeTrainJob[] };
    expect(data.ok).toBe(true);
    expect(data.jobs.length).toBeGreaterThan(0);
    for (const job of data.jobs) {
      expect(job.status).toBe("queued");
      expect(job.ambiente).toBe("lab");
      assertSafeJob(job);
    }
  });

  it("rejeita query inválida com 400", async () => {
    const res = await listGet(req("GET", "http://localhost/api/train/jobs?status=zumbi"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/train/jobs/:id", () => {
  it("detalhe devolve o job (sem campos internos)", async () => {
    const created = (await (
      await POST(
        req("POST", "http://localhost/api/train/jobs", { serverId: 1, baseModel: "qwen3:8b", method: "lora", datasetPath: "/x.jsonl" }, MUTATION),
      )
    ).json()) as { job: SafeTrainJob };
    const res = await detailGet(req("GET", `http://localhost/api/train/jobs/${created.job.id}`), ctx(String(created.job.id)));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { job: SafeTrainJob };
    assertSafeJob(data.job);
    expect(data.job.id).toBe(created.job.id);
  });

  it("id inválido → 400; id inexistente → 404", async () => {
    expect((await detailGet(req("GET", "http://localhost/api/train/jobs/abc"), ctx("abc"))).status).toBe(400);
    expect((await detailGet(req("GET", "http://localhost/api/train/jobs/999999"), ctx("999999"))).status).toBe(404);
  });
});

describe("POST /api/train/jobs/:id/stop", () => {
  it("cancela job na fila e reporta cancelado: true", async () => {
    const created = (await (
      await POST(
        req("POST", "http://localhost/api/train/jobs", { serverId: 1, baseModel: "qwen3:8b", method: "lora", datasetPath: "/x.jsonl" }, MUTATION),
      )
    ).json()) as { job: SafeTrainJob };
    const res = await stopPost(req("POST", `http://localhost/api/train/jobs/${created.job.id}/stop`, undefined, MUTATION), ctx(String(created.job.id)));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cancelado: boolean; job: SafeTrainJob };
    expect(data.cancelado).toBe(true);
    expect(data.job.status).toBe("cancelled");
  });

  it("stop de job já terminado responde cancelado: false (idempotente)", async () => {
    const sid = await sparkId();
    const id = getDb()
      .insert(trainJobs)
      .values({ serverId: sid, baseModel: "m", method: "lora", datasetPath: "/x.jsonl", status: "done", finishedAt: Date.now() })
      .returning()
      .get()!.id;
    const res = await stopPost(req("POST", `http://localhost/api/train/jobs/${id}/stop`, undefined, MUTATION), ctx(String(id)));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { cancelado: boolean };
    expect(data.cancelado).toBe(false);
  });

  it("id inexistente → 404", async () => {
    const res = await stopPost(req("POST", "http://localhost/api/train/jobs/999999/stop", undefined, MUTATION), ctx("999999"));
    expect(res.status).toBe(404);
  });
});

describe("fila de treinos (runner)", () => {
  it("processTrainQueue marca o job como falho com mensagem clara até o runner real (T2)", async () => {
    // O runner processa o job de MENOR id na fila: limpa enfileirados de
    // testes anteriores para que o alvo deste teste seja processado.
    getDb().update(trainJobs).set({ status: "cancelled" }).where(eq(trainJobs.status, "queued")).run();
    const sid = await sparkId();
    const id = getDb()
      .insert(trainJobs)
      .values({ serverId: sid, baseModel: "m", method: "lora", datasetPath: "/x.jsonl", status: "queued" })
      .returning()
      .get()!.id;

    await processTrainQueue();

    const row = getDb().select().from(trainJobs).where(eq(trainJobs.id, id)).get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toContain("T2");
  });

  it("recoverStaleTrain marca running como falho (painel reiniciado)", async () => {
    const sid = await sparkId();
    const id = getDb()
      .insert(trainJobs)
      .values({ serverId: sid, baseModel: "m", method: "lora", datasetPath: "/x.jsonl", status: "running", startedAt: Date.now() })
      .returning()
      .get()!.id;

    recoverStaleTrain();

    const row = getDb().select().from(trainJobs).where(eq(trainJobs.id, id)).get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toContain("reiniciado");
  });
});

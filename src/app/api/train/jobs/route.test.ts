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

// Runner sem rede nem flock: execOnServer sob controle e lock desativado.
process.env.ICEWALL_TRAIN_LOCK_DISABLE = "1";
vi.mock("@/server/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/executor")>();
  return { ...actual, driverFor: vi.fn(), execOnServer: vi.fn() };
});

import { driverFor, execOnServer } from "@/server/executor";
import type { ServerDriver } from "@/lib/servers/server-driver";
import type { ExecResult } from "@/lib/servers/server-driver";
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

const driverForMock = vi.mocked(driverFor);
const execMock = vi.mocked(execOnServer);

const driverFalso = {
  mkdir: vi.fn(async () => undefined),
  put: vi.fn(async () => undefined),
  close: vi.fn(),
} as unknown as ServerDriver & { put: ReturnType<typeof vi.fn>; mkdir: ReturnType<typeof vi.fn> };

/** Respostas por tipo de comando: home, lançamento (nohup) e poll (kill -0). */
function mockarExecutor(poll: string | null = null): void {
  driverForMock.mockReturnValue(driverFalso);
  execMock.mockImplementation(async (_serverId: number, cmd: string): Promise<ExecResult> => {
    if (cmd.startsWith("echo $HOME")) return { code: 0, stdout: "/home/facini\n", stderr: "", ms: 1 };
    if (cmd.includes("nohup sh")) return { code: 0, stdout: "12345\n", stderr: "", ms: 1 };
    if (cmd.includes("kill -0")) return { code: 0, stdout: poll ?? "", stderr: "", ms: 1 };
    return { code: 0, stdout: "", stderr: "", ms: 1 };
  });
}

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

describe("fila de treinos (runner real, executor mockado)", () => {
  const PARAMS = {
    learningRate: 2e-4,
    epochs: 3,
    r: 16,
    alpha: 16,
    dropout: 0,
    batchSize: 2,
    gradientAccumulationSteps: 4,
    maxSeqLength: 512,
    bf16: true,
  };

  const POLL_DONE = [
    "@@status@@",
    "exit=0",
    "@@alive@@",
    "no",
    "@@gpu@@",
    "1024",
    "@@log@@",
    '@@ICW {"type":"start","total_steps":12,"total_epochs":3.0}@@',
    '@@ICW {"type":"step","step":12,"loss":1.23,"lr":0.0001,"epoch":3.0}@@',
    '@@ICW {"type":"done","train_loss":1.4123}@@',
    '@@ICW {"type":"saved","adapter":"/workspace/out/adapter"}@@',
  ].join("\n");

  it("inicia job enfileirado: workspace, upload do script, nohup e status running", async () => {
    getDb().update(trainJobs).set({ status: "cancelled" }).where(eq(trainJobs.status, "queued")).run();
    const sid = await sparkId();
    const id = getDb()
      .insert(trainJobs)
      .values({
        serverId: sid,
        baseModel: "HuggingFaceTB/SmolLM2-135M",
        method: "lora",
        datasetPath: "/home/facini/icewall/datasets/ds.jsonl",
        status: "queued",
        paramsJson: PARAMS,
      })
      .returning()
      .get()!.id;

    mockarExecutor();
    await processTrainQueue();

    const row = getDb().select().from(trainJobs).where(eq(trainJobs.id, id)).get()!;
    expect(row.status).toBe("running");
    expect(row.workspacePath).toBe(`/tmp/icewall-train-${id}`);
    expect(row.remotePid).toBe(12345);
    expect(driverFalso.mkdir).toHaveBeenCalledWith(`/tmp/icewall-train-${id}`, "755");
    expect(driverFalso.put).toHaveBeenCalledTimes(2); // fine_tune.py + run.sh
    const remotos = driverFalso.put.mock.calls.map((c) => String(c[1]));
    expect(remotos.some((r) => r.endsWith("fine_tune.py"))).toBe(true);
    expect(remotos.some((r) => r.endsWith("run.sh"))).toBe(true);
  });

  it("poll com exit=0: finaliza done, guarda loss final e histórico", async () => {
    // Drena running de testes anteriores: o runner processa um job por tick.
    getDb().update(trainJobs).set({ status: "cancelled", workspacePath: null }).where(eq(trainJobs.status, "running")).run();
    const sid = await sparkId();
    const id = getDb()
      .insert(trainJobs)
      .values({
        serverId: sid,
        baseModel: "m",
        method: "lora",
        datasetPath: "/home/facini/icewall/datasets/ds.jsonl",
        status: "running",
        workspacePath: `/tmp/icewall-train-${sid}-done`,
        remotePid: 99,
        totalEpochs: 3,
        paramsJson: PARAMS,
      })
      .returning()
      .get()!.id;

    mockarExecutor(POLL_DONE);
    await processTrainQueue();

    const row = getDb().select().from(trainJobs).where(eq(trainJobs.id, id)).get()!;
    expect(row.status).toBe("done");
    expect(row.progressPct).toBe(100);
    expect(row.valLoss).toBe(1.4123);
    expect(row.lossHistory).toContainEqual({ step: 12, value: 1.23 });
    expect(row.current).toBe("concluído");
  });

  it("poll com exit!=0 e marcador de erro: failed com a mensagem clara", async () => {
    getDb().update(trainJobs).set({ status: "cancelled", workspacePath: null }).where(eq(trainJobs.status, "running")).run();
    const sid = await sparkId();
    const id = getDb()
      .insert(trainJobs)
      .values({
        serverId: sid,
        baseModel: "m",
        method: "qlora",
        datasetPath: "/home/facini/icewall/datasets/ds.jsonl",
        status: "running",
        workspacePath: `/tmp/icewall-train-${sid}-fail`,
        remotePid: 98,
        totalEpochs: 1,
        paramsJson: PARAMS,
      })
      .returning()
      .get()!.id;
    const poll = [
      "@@status@@",
      "exit=1",
      "@@alive@@",
      "no",
      "@@gpu@@",
      "0",
      "@@log@@",
      '@@ICW {"type":"error","message":"OOM no carregamento do modelo"}@@',
    ].join("\n");

    mockarExecutor(poll);
    await processTrainQueue();

    const row = getDb().select().from(trainJobs).where(eq(trainJobs.id, id)).get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toBe("OOM no carregamento do modelo");
  });

  it("cancelamento: job cancelado com workspace tem o container remoto removido", async () => {
    const sid = await sparkId();
    const id = getDb()
      .insert(trainJobs)
      .values({
        serverId: sid,
        baseModel: "m",
        method: "lora",
        datasetPath: "/x.jsonl",
        status: "cancelled",
        workspacePath: `/tmp/icewall-train-${sid}-canc`,
        remotePid: 97,
      })
      .returning()
      .get()!.id;

    mockarExecutor();
    await processTrainQueue();

    const row = getDb().select().from(trainJobs).where(eq(trainJobs.id, id)).get()!;
    expect(row.status).toBe("cancelled");
    expect(row.workspacePath).toBeNull(); // limpo: não reprocessa
    const chamouDockerRm = execMock.mock.calls.some((c) => String(c[1]).includes(`rm -f 'icewall-train-${id}'`));
    expect(chamouDockerRm).toBe(true);
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/server/db/client";
import { driverFor, execOnServer } from "@/server/executor";
import type { ServerDriver } from "@/lib/servers/server-driver";
import type { ExecResult } from "@/lib/servers/server-driver";
import { processExportQueue, recoverStaleExports } from "./export";
import { servers, trainArtifacts, trainJobs } from "@/server/db/schema";

// Sem rede: executor sob controle (a fila de exports não usa flock — é CPU).
vi.mock("@/server/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/executor")>();
  return { ...actual, driverFor: vi.fn(), execOnServer: vi.fn() };
});

const driverForMock = vi.mocked(driverFor);
const execMock = vi.mocked(execOnServer);

const driverFalso = {
  mkdir: vi.fn(async () => undefined),
  put: vi.fn(async () => undefined),
  get: vi.fn(async () => undefined),
  close: vi.fn(),
} as unknown as ServerDriver & { put: ReturnType<typeof vi.fn> };

function pollOut(final: string | null, size: number): ExecResult {
  return {
    code: 0,
    stdout: ["@@status@@", final ?? "none", "@@size@@", String(size), "@@log@@", "linha do convert"].join("\n"),
    stderr: "",
    ms: 1,
  };
}

function mockarExec(poll: ExecResult | null = null): void {
  driverForMock.mockReturnValue(driverFalso);
  execMock.mockImplementation(async (_serverId: number, cmd: string): Promise<ExecResult> => {
    if (cmd.startsWith("echo $HOME")) return { code: 0, stdout: "/home/facini\n", stderr: "", ms: 1 };
    if (cmd.includes("nohup sh")) return { code: 0, stdout: "777\n", stderr: "", ms: 1 };
    if (cmd.includes("kill -0")) return { code: 0, stdout: "yes\n", stderr: "", ms: 1 };
    if (poll && cmd.includes("@@status@@")) return poll;
    return { code: 0, stdout: "", stderr: "", ms: 1 };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockarExec();
});

async function sparkId(): Promise<number> {
  const row = getDb().select().from(servers).all().find((s) => s.nome === "Spark");
  expect(row, "seed do Spark precisa existir").toBeDefined();
  return row!.id;
}

async function jobConcluido(sid: number, idDesejado?: number): Promise<number> {
  const ws = `/tmp/icewall-train-${idDesejado ?? 900}`;
  const job = getDb()
    .insert(trainJobs)
    .values({
      serverId: sid,
      baseModel: "HuggingFaceTB/SmolLM2-135M",
      method: "lora",
      datasetPath: "/home/facini/icewall/datasets/ds.jsonl",
      status: "done",
      workspacePath: ws,
      finishedAt: Date.now(),
      paramsJson: { learningRate: 2e-4, epochs: 1, r: 8, alpha: 16, dropout: 0, batchSize: 2, gradientAccumulationSteps: 1, maxSeqLength: 256, bf16: true },
    })
    .returning()
    .get()!;
  return job.id;
}

describe("processExportQueue", () => {
  it("inicia export pending: prepara scripts (inner/export/merge), lança nohup e marca running", async () => {
    const sid = await sparkId();
    const jobId = await jobConcluido(sid);
    const art = getDb()
      .insert(trainArtifacts)
      .values({ jobId, serverId: sid, kind: "gguf", quant: "q4_k_m", remotePath: `/tmp/icewall-train-900/export-q4_k_m/gguf-q4_k_m.gguf`, status: "pending" })
      .returning()
      .get()!;

    await processExportQueue();

    const row = getDb().select().from(trainArtifacts).where(eq(trainArtifacts.id, art.id)).get()!;
    expect(row.status, `erro do artifact: ${row.error ?? "—"}`).toBe("running");
    expect(driverFalso.put).toHaveBeenCalledTimes(3); // inner.sh + export.sh + merge_lora.py
    const remotos = driverFalso.put.mock.calls.map((c) => String(c[1]));
    expect(remotos.some((r) => r.endsWith("inner.sh"))).toBe(true);
    expect(remotos.some((r) => r.endsWith("export.sh"))).toBe(true);
    expect(remotos.some((r) => r.endsWith("merge_lora.py"))).toBe(true);
  });

  it("poll com exit=0 e GGUF presente: done com sizeBytes", async () => {
    // Drena running/pending de testes anteriores: um export por tick.
    getDb().update(trainArtifacts).set({ status: "failed" }).where(inArray(trainArtifacts.status, ["running", "pending"])).run();
    const sid = await sparkId();
    const jobId = await jobConcluido(sid);
    const art = getDb()
      .insert(trainArtifacts)
      .values({ jobId, serverId: sid, kind: "gguf", quant: "f16", remotePath: `/tmp/icewall-train-900/export-f16/gguf-f16.gguf`, status: "running" })
      .returning()
      .get()!;

    mockarExec(pollOut("exit=0", 104857600));
    await processExportQueue();

    const row = getDb().select().from(trainArtifacts).where(eq(trainArtifacts.id, art.id)).get()!;
    expect(row.status).toBe("done");
    expect(row.sizeBytes).toBe(104857600);
  });

  it("poll com exit!=0: failed com erro claro", async () => {
    getDb().update(trainArtifacts).set({ status: "failed" }).where(inArray(trainArtifacts.status, ["running", "pending"])).run();
    const sid = await sparkId();
    const jobId = await jobConcluido(sid);
    const art = getDb()
      .insert(trainArtifacts)
      .values({ jobId, serverId: sid, kind: "gguf", quant: "q8_0", remotePath: `/tmp/icewall-train-900/export-q8_0/gguf-q8_0.gguf`, status: "running" })
      .returning()
      .get()!;

    mockarExec(pollOut("exit=1", 0));
    await processExportQueue();

    const row = getDb().select().from(trainArtifacts).where(eq(trainArtifacts.id, art.id)).get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toContain("exit 1");
  });

  it("recoverStaleExports marca running como falho (painel reiniciado)", async () => {
    const sid = await sparkId();
    const jobId = await jobConcluido(sid);
    const art = getDb()
      .insert(trainArtifacts)
      .values({ jobId, serverId: sid, kind: "gguf", quant: "f16", remotePath: "/x.gguf", status: "running" })
      .returning()
      .get()!;

    recoverStaleExports();

    const row = getDb().select().from(trainArtifacts).where(eq(trainArtifacts.id, art.id)).get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toContain("reiniciado");
  });

  void schema;
});

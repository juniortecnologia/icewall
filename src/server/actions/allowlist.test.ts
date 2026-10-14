import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { ExecResult } from "@/lib/servers/server-driver";
import { getDb } from "../db/client";
import { actionLog } from "../db/schema";
import { serverIdByName } from "../executor";
import { resolveServer, runAction, verifyContainer } from "./allowlist";

/**
 * Testes da allowlist parametrizada por servidor (Etapa 04 do plano
 * multi-servidor). Banco em memória com seed Station (local) + Spark (ssh);
 * o executor HTTP/SSH real nunca é chamado: as ações recebem um exec falso,
 * no mesmo padrão dos coletores.
 */

type Exec = (serverId: number, cmd: string, timeoutMs?: number) => Promise<ExecResult>;

const okExec: Exec = async () => ({ code: 0, stdout: "ok\n", stderr: "", ms: 1 });

const captureExec = (responses: { match?: RegExp; res: ExecResult }[], calls: string[] = []): { exec: Exec; calls: string[] } => {
  return {
    exec: async (_id, cmd) => {
      calls.push(cmd);
      const found = responses.find((r) => !r.match || r.match.test(cmd));
      if (!found) return { code: -1, stdout: "", stderr: "[teste] comando inesperado", ms: 1 };
      return found.res;
    },
    calls,
  };
};

describe("resolveServer — alvo da ação sempre vem do registro", () => {
  it("sem serverId, resolve o servidor principal (Spark do seed)", () => {
    expect(resolveServer().nome).toBe("Spark");
  });

  it("com serverId, resolve o servidor pedido (Station local)", () => {
    expect(resolveServer(serverIdByName("Station")).nome).toBe("Station");
  });

  it("servidor inexistente → erro claro, nunca silêncio", () => {
    expect(() => resolveServer(999_999)).toThrow("servidor inexistente no registro: id 999999");
  });
});

describe("verifyContainer — verifica o container na hora, sem snapshot quente", () => {
  const station = () => resolveServer(serverIdByName("Station"));

  it("container existe → devolve o nome protegido (shellArg)", async () => {
    await expect(verifyContainer(station(), "meu-app", okExec)).resolves.toBe("'meu-app'");
  });

  it("container ausente → 'container não encontrado no servidor X' (não lista vazia)", async () => {
    const { exec, calls } = captureExec([
      { res: { code: 1, stdout: "", stderr: "Error response from daemon: No such object: fantasma", ms: 1 } },
    ]);
    await expect(verifyContainer(station(), "fantasma", exec)).rejects.toThrow(
      "container não encontrado no servidor Station: fantasma",
    );
    expect(calls.some((c) => c.includes("docker inspect"))).toBe(true);
  });

  it("docker ausente/quebrado → 'docker indisponível no servidor X' com o detalhe", async () => {
    const { exec } = captureExec([
      { res: { code: 127, stdout: "", stderr: "docker: command not found", ms: 1 } },
    ]);
    await expect(verifyContainer(station(), "foo", exec)).rejects.toThrow(
      "docker indisponível no servidor Station: docker: command not found",
    );
  });

  it("executor falha (servidor indisponível) → repassa a mensagem clara do executor", async () => {
    const { exec } = captureExec([
      { res: { code: -1, stdout: "", stderr: "[icewall] servidor \"Spark\" indisponível: campos SSH incompletos (chaveSshPath)", ms: 1 } },
    ]);
    await expect(verifyContainer(station(), "foo", exec)).rejects.toThrow("campos SSH incompletos");
  });

  it("nome malicioso → recusado antes de tocar o servidor", async () => {
    await expect(verifyContainer(station(), "a; reboot", okExec)).rejects.toThrow("argumento recusado");
  });
});

describe("runAction — ações de container parametrizadas por servidor", () => {
  it("container.start na Station: verifica na hora, executa e registra serverId no action_log", async () => {
    const stationId = serverIdByName("Station")!;
    const { exec, calls } = captureExec([
      { res: { code: 0, stdout: "meu-app\n", stderr: "", ms: 1 } },
    ]);
    const res = await runAction("container.start", "meu-app", { serverId: stationId, exec });
    expect(res.ok).toBe(true);
    expect(calls.some((c) => c.includes("docker inspect"))).toBe(true);
    expect(calls.some((c) => c.includes("docker start 'meu-app'"))).toBe(true);

    const last = getDb().select().from(actionLog).where(eq(actionLog.action, "container.start")).orderBy(desc(actionLog.id)).limit(1).get();
    expect(last?.status).toBe("ok");
    expect(last?.serverId).toBe(stationId);
  });

  it("container.stop no id inexistente: falha com erro claro e log com o servidor alvo", async () => {
    const res = await runAction("container.stop", "fantasma", { serverId: 999_999, exec: okExec }).catch(() => null);
    // resolveServer lança dentro de runAction, que converte em { ok: false }
    expect(res?.ok).toBe(false);
    expect(res?.output).toContain("servidor inexistente no registro: id 999999");
  });

  it("container.logs de container ausente: erro claro em vez de saída vazia", async () => {
    const { exec } = captureExec([
      { res: { code: 1, stdout: "", stderr: "Error: No such container: sumiu", ms: 1 } },
    ]);
    const res = await runAction("container.logs", "sumiu", { serverId: serverIdByName("Station"), exec });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("container não encontrado no servidor Station: sumiu");
  });
});

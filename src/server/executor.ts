import "server-only";
import { eq } from "drizzle-orm";
import { createDriver, type ExecResult, type ServerDriver } from "@/lib/servers/server-driver";
import "@/lib/servers/drivers"; // registra as fábricas "local" e "ssh"
import { getDb } from "./db/client";
import { servers } from "./db/schema";

/**
 * Executor por servidor — Etapa 02 do plano multi-servidor.
 * Centraliza a execução de comandos: qualquer comando roda em qualquer
 * servidor cadastrado no registro central `servers`, usando o driver do
 * servidor (`local` ou `ssh`) em vez de um host fixo por constante.
 *
 * Falhas (servidor inexistente, campos SSH incompletos, driver desconhecido)
 * devolvem um `ExecResult` com `code: -1` e mensagem clara em `stderr` —
 * nunca uma lista vazia nem silêncio: os coletores registram a falha no
 * snapshot e o painel mostra o erro.
 */

/** Linha do registro `servers` (típico dos coletores por servidor). */
export type ServerRef = typeof servers.$inferSelect;

/** Id do servidor pelo nome (resolução por nome no registro, não por constante). */
export function serverIdByName(nome: string): number | null {
  const row = getDb().select({ id: servers.id }).from(servers).where(eq(servers.nome, nome)).limit(1).get();
  return row?.id ?? null;
}

/** Linhas do registro `servers` (ordem estável por id) para os jobs iterarem. */
export function listServers(): typeof servers.$inferSelect[] {
  return getDb().select().from(servers).orderBy(servers.id).all();
}

/**
 * Linha do servidor "principal" para leitura compatível: o Spark, quando
 * cadastrado — toda a série histórica (e o painel antigo) é dele. Senão, o
 * primeiro do registro; null se o registro estiver vazio.
 */
export function primaryServer(): ServerRef | null {
  const spark = getDb().select().from(servers).where(eq(servers.nome, "Spark")).limit(1).get();
  if (spark) return spark;
  return getDb().select().from(servers).orderBy(servers.id).limit(1).get() ?? null;
}

export function primaryServerId(): number | null {
  return primaryServer()?.id ?? null;
}

/**
 * Driver do servidor pelo id do registro — para operações de arquivo
 * (put/get/ls/mkdir), que o `execOnServer` não cobre. A resolução espelha a
 * do `execOnServer` (local ignora host/usuario/chave; SSH exige os três).
 */
export function driverFor(serverId: number): ServerDriver {
  const row = getDb().select().from(servers).where(eq(servers.id, serverId)).limit(1).get();
  if (!row) {
    throw new Error(`servidor inexistente no registro: id ${serverId} (cadastre em /servers)`);
  }
  if (row.tipo === "local") {
    return createDriver("local", { host: row.host || "localhost", user: "", keyPath: "" });
  }
  if (row.tipo === "ssh") {
    if (!row.host || !row.usuario || !row.chaveSshPath) {
      const faltando = [!row.host ? "host" : null, !row.usuario ? "usuario" : null, !row.chaveSshPath ? "chaveSshPath" : null]
        .filter(Boolean)
        .join(", ");
      throw new Error(`servidor "${row.nome}" (id ${row.id}) indisponível: campos SSH incompletos (${faltando})`);
    }
    return createDriver("ssh", { host: row.host, port: row.porta ?? undefined, user: row.usuario, keyPath: row.chaveSshPath });
  }
  throw new Error(`servidor "${row.nome}" (id ${row.id}) tem tipo desconhecido: ${String(row.tipo)}`);
}

/** Marca de falha do executor: code -1 + mensagem clara no stderr. */
function falha(mensagem: string, ms = 0): ExecResult {
  return { code: -1, stdout: "", stderr: `[icewall] ${mensagem}`, ms };
}

/**
 * Executa um comando no servidor pelo id do registro.
 * O comando vem SEMPRE de uma constante deste projeto ou de `shellArg`
 * sobre um valor validado: nunca concatene texto vindo da interface.
 */
export async function execOnServer(serverId: number, command: string, timeoutMs = 20_000): Promise<ExecResult> {
  const started = Date.now();
  const row = getDb().select().from(servers).where(eq(servers.id, serverId)).limit(1).get();
  if (!row) {
    return falha(`servidor inexistente no registro: id ${serverId} (cadastre em /servers)`, Date.now() - started);
  }

  if (row.tipo === "local") {
    // O driver local ignora host/usuario/chaveSshPath.
    const driver = createDriver("local", { host: row.host || "localhost", user: "", keyPath: "" });
    return driver.exec(command, timeoutMs);
  }

  if (row.tipo === "ssh") {
    if (!row.host || !row.usuario || !row.chaveSshPath) {
      const faltando = [
        !row.host ? "host" : null,
        !row.usuario ? "usuario" : null,
        !row.chaveSshPath ? "chaveSshPath" : null,
      ]
        .filter(Boolean)
        .join(", ");
      return falha(`servidor "${row.nome}" (id ${row.id}) indisponível: campos SSH incompletos (${faltando})`, Date.now() - started);
    }
    const driver = createDriver("ssh", { host: row.host, port: row.porta ?? undefined, user: row.usuario, keyPath: row.chaveSshPath });
    // LC_ALL=C: mesma convenção da antiga sparkExec — saída estável para os
    // parsers, independente do locale do servidor remoto.
    return driver.exec(`export LC_ALL=C; ${command}`, timeoutMs);
  }

  return falha(`servidor "${row.nome}" (id ${row.id}) tem tipo desconhecido: ${String(row.tipo)}`, Date.now() - started);
}

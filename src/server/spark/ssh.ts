import "server-only";
import { spawn } from "node:child_process";
import type { ExecResult } from "@/lib/servers/server-driver";
import { execOnServer, serverIdByName } from "../executor";
import { parseSshAuthMethods } from "../parsers";

// Usada apenas fora da via nova: a área de bench (spark-run.ts) ainda não
// migrou para o registro (etapas seguintes).
export const SPARK_HOST = process.env.SPARK_SSH_HOST ?? "spark";

export type { ExecResult };

/**
 * Fachada compatível (Etapa 02): o Spark é resolvido por nome no registro
 * central `servers` e o comando roda pelo driver do servidor — nenhuma
 * constante SPARK_SSH_HOST nesta via.
 * O comando vem SEMPRE de uma constante deste projeto ou de `shellArg` sobre
 * um valor validado: nunca concatene texto vindo da interface aqui.
 */
export function sparkExec(command: string, timeoutMs = 20_000): Promise<ExecResult> {
  const id = serverIdByName("Spark");
  if (id === null) {
    return Promise.resolve({
      code: -1,
      stdout: "",
      stderr: '[icewall] servidor "Spark" não encontrado no registro — cadastre em /servers',
      ms: 0,
    });
  }
  return execOnServer(id, command, timeoutMs);
}

const SAFE_ARG = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,200}$/;

/** Aceita só nomes simples (container, modelo) e devolve entre aspas simples. */
export function shellArg(value: string): string {
  if (!SAFE_ARG.test(value)) throw new Error(`argumento recusado: ${JSON.stringify(value)}`);
  return `'${value}'`;
}

const SAFE_PATH = /^\/[A-Za-z0-9_.@/-]{0,199}$/;

/**
 * Aceita só caminhos absolutos simples (sem espaço, $, aspas, ;, |, `) e
 * devolve entre aspas simples. O `shellArg` acima recusa caminhos por
 * exigir primeiro caractere alfanumérico — herança da era de nomes de
 * modelo/container.
 */
export function shellPath(value: string): string {
  if (!SAFE_PATH.test(value)) throw new Error(`caminho recusado: ${JSON.stringify(value)}`);
  return `'${value}'`;
}

/**
 * Tenta entrar em um host sem chave e sem conexão compartilhada para ver
 * quais métodos o sshd oferece (Etapa 03: host vem do registro, não de
 * constante). BatchMode impede que alguma senha seja enviada: o servidor só
 * responde "Permission denied (métodos)".
 */
export function sshAuthMethods(host: string, timeoutMs = 10_000): Promise<string[] | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "ssh",
      [
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=5",
        "-o", "ControlPath=none",
        "-o", "PubkeyAuthentication=no",
        "-o", "PreferredAuthentications=password,keyboard-interactive",
        host,
        "true",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", () => {
      clearTimeout(timer);
      resolve(parseSshAuthMethods(stderr));
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

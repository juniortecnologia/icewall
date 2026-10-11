import "server-only";
import { spawn } from "node:child_process";

export const SPARK_HOST = process.env.SPARK_SSH_HOST ?? "spark";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

/**
 * Roda um comando no Spark via `ssh spark` (alias com ControlMaster no ~/.ssh/config).
 * O comando vem SEMPRE de uma constante deste projeto ou de `shellArg` sobre um valor validado:
 * nunca concatene texto vindo da interface aqui.
 */
export function sparkExec(command: string, timeoutMs = 20_000): Promise<ExecResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", SPARK_HOST, `export LC_ALL=C; ${command}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += `\n[icewall] timeout após ${timeoutMs} ms`;
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, ms: Date.now() - started });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err), ms: Date.now() - started });
    });
  });
}

const SAFE_ARG = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,200}$/;

/** Aceita só nomes simples (container, modelo) e devolve entre aspas simples. */
export function shellArg(value: string): string {
  if (!SAFE_ARG.test(value)) throw new Error(`argumento recusado: ${JSON.stringify(value)}`);
  return `'${value}'`;
}

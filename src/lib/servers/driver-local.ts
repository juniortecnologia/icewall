import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { ServerDriver, BaseConfig, ExecResult } from "./server-driver";

/**
 * Driver para o servidor local — a máquina em que o icewall roda ("Station").
 * Mesmo contrato de `SshDriver` (exec, put, get, ls, mkdir, ping), sem rede:
 * comandos rodam em `sh -c` local, put/get são cópias de arquivo entre
 * caminhos locais e ls/mkdir usam o sistema de arquivos.
 * Os campos de `BaseConfig` (host/user/keyPath) são ignorados.
 */
export class LocalDriver extends ServerDriver {
  constructor(config: BaseConfig) {
    super(config);
  }

  async exec(command: string, timeoutMs = 60_000): Promise<ExecResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      const child = spawn("sh", ["-c", command], { stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        stderr += `\n[icewall] timeout após ${timeoutMs} ms`;
        resolve({ code: -1, stdout, stderr, ms: Date.now() - started });
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr, ms: Date.now() - started });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout: "", stderr: String(err), ms: Date.now() - started });
      });
    });
  }

  /** put: cópia local → local (cria o diretório de destino se preciso). */
  async put(localPath: string, remotePath: string): Promise<void> {
    await fs.mkdir(path.dirname(remotePath), { recursive: true });
    await fs.copyFile(localPath, remotePath);
  }

  /** get: cópia local → local (cria o diretório de destino se preciso). */
  async get(remotePath: string, localPath: string): Promise<void> {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.copyFile(remotePath, localPath);
  }

  async ls(dir: string): Promise<string[]> {
    return fs.readdir(dir);
  }

  async mkdir(dir: string, mode = "755"): Promise<void> {
    await fs.mkdir(dir, { recursive: true, mode: parseInt(mode, 8) });
  }

  async ping(timeoutMs = 10_000): Promise<boolean> {
    try {
      const result = await this.exec("true", timeoutMs);
      return result.code === 0;
    } catch {
      return false;
    }
  }

  close(): void {
    // O driver local não mantém recursos abertos.
  }
}

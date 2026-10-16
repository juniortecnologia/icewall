import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ServerDriver, BaseConfig, ExecResult } from "./server-driver";

/**
 * Pads a string so the next char is not alphanumeric (avoids e.g. '-o' becoming '-oa').
 */
function quote(s: string): string {
  return `'${s.replace(/'/g, "'\"'\"'")}'`;
}

function escapeArg(s: string): string {
  // For arguments that may contain spaces/special chars, use single quotes + escaping
  return `'${s.replace(/'/g, "\\x27")}'`;
}

/**
 * Driver que executa via `ssh` CLI (Open SSH).
 * Funciona com any system that has `ssh` binary and ssh-key based auth.
 */
export class SshDriver extends ServerDriver {
  constructor(public override config: BaseConfig & { passphrase?: string }) {
    super(config as BaseConfig);
  }

  private _buildSshArgs(command: string): string[] {
    const port = this.config.port ?? 22;
    return [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-p", String(port),
      "-i", this.config.keyPath,
      "-l", this.config.user,
      this.config.host,
      command,
    ];
  }

  async exec(command: string, timeoutMs = 60_000): Promise<ExecResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      // ssh directly executes the remote command, not shell.
      // We use sh -c "..." to allow complex commands (pipes, redirections).
      const args = this._buildSshArgs(`sh -c ${quote(command)}`);
      const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });

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

  private _scpArgs(): string[] {
    const port = this.config.port ?? 22;
    // scp: porta é -P (maiúsculo) e NÃO existe -l — o usuário vai no destino.
    return [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-P", String(port),
      "-i", this.config.keyPath,
    ];
  }

  private destino(): string {
    return this.config.user ? `${this.config.user}@${this.config.host}` : this.config.host;
  }

  async put(localPath: string, remotePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("scp", [
        ...this._scpArgs(),
        localPath,
        // Caminho remoto CRU: o scp moderno (SFTP) não passa pelo shell remoto,
        // então aspas viram literais. Nossos caminhos são gerados sem espaços.
        `${this.destino()}:${remotePath}`,
      ], { stdio: ["pipe", "ignore", "pipe"] });

      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`scp put failed (${code}): ${stderr.trim()}`));
      });
    });
  }

  async get(remotePath: string, localPath: string): Promise<void> {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const child = spawn("scp", [
        ...this._scpArgs(),
        `${this.destino()}:${remotePath}`,
        localPath,
      ], { stdio: ["pipe", "ignore", "pipe"] });

      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`scp get failed (${code}): ${stderr.trim()}`));
      });
    });
  }

  async ls(dir: string): Promise<string[]> {
    const result = await this.exec(`ls -1 "${dir}"`);
    if (result.code !== 0) throw new Error(result.stderr.trim());
    return result.stdout.trim().split("\n").filter(Boolean);
  }

  async mkdir(dir: string, mode = "755"): Promise<void> {
    const result = await this.exec(`mkdir -p -m ${mode} "${dir}"`);
    if (result.code !== 0) throw new Error(result.stderr.trim());
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
    // ssh doesn't maintain persistent connection state with scp commands.
    // If using ControlMaster via SSH config, it will auto-expire IdleTimeout.
  }
}

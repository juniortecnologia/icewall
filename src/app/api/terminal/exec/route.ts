import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getSession } from "@/server/auth/session";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const { command, target, host, user, port } = await req.json();
    if (!command || typeof command !== "string") {
      return NextResponse.json({ ok: false, error: "Comando ausente" }, { status: 400 });
    }

    const trimmed = command.trim();
    if (!trimmed) {
      return NextResponse.json({ ok: true, output: "" });
    }

    let finalCmd = trimmed;

    // target pode ser 'local' ou 'remote'
    if (target === "remote") {
      const sshHost = host || "10.0.5.18";
      const sshUser = user || (sshHost === "10.0.5.18" ? "facini" : "junior");
      const sshPort = Number(port) || 22;
      const escaped = trimmed.replace(/'/g, "'\\''");

      // Se for o host 10.0.5.18 ou 'spark' configurado no ~/.ssh/config, aproveita a chave e config do usuário
      if (sshHost === "10.0.5.18" || sshHost === "spark") {
        finalCmd = `ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${sshUser}@10.0.5.18 '${escaped}'`;
      } else {
        finalCmd = `ssh -p ${sshPort} -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${sshUser}@${sshHost} '${escaped}'`;
      }
    }

    try {
      const { stdout, stderr } = await execAsync(finalCmd, {
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 2,
      });

      return NextResponse.json({
        ok: true,
        output: stdout + (stderr ? `\n[stderr]\n${stderr}` : ""),
        exitCode: 0,
      });
    } catch (err: unknown) {
      const execError = err as { stdout?: string; stderr?: string; message?: string; code?: number };
      return NextResponse.json({
        ok: false,
        output: (execError.stdout || "") + (execError.stderr ? `\n${execError.stderr}` : "") + (execError.message && !execError.stdout && !execError.stderr ? execError.message : ""),
        exitCode: execError.code ?? 1,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


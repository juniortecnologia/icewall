import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getSession } from "@/server/auth/session";
import { recordAuditLog } from "@/server/auth/audit";
import { getDb } from "@/server/db/client";
import { saasTenants, saasClusters, saasUsers } from "@/server/db/schema";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    let gitBranch = "main";
    let gitCommit = "unknown";
    let gitDirty = false;
    let uptimeSeconds = process.uptime();

    try {
      const { stdout: branch } = await execAsync("git branch --show-current", { timeout: 3000 });
      gitBranch = branch.trim();
      const { stdout: commit } = await execAsync("git rev-parse --short HEAD", { timeout: 3000 });
      gitCommit = commit.trim();
      const { stdout: status } = await execAsync("git status --porcelain", { timeout: 3000 });
      gitDirty = Boolean(status.trim());
    } catch {
      // ignore
    }

    const db = getDb();
    const tenant = db.select().from(saasTenants).where(eq(saasTenants.id, session.tenantId)).get();
    const clusterCount = db.select().from(saasClusters).where(eq(saasClusters.tenantId, session.tenantId)).all().length;
    const userCount = db.select().from(saasUsers).where(eq(saasUsers.tenantId, session.tenantId)).all().length;

    return NextResponse.json({
      ok: true,
      system: {
        version: "v1.3.0",
        edition: "ICEWALL SaaS Enterprise Core",
        tenant: tenant?.name || "ICEWALL Master Cloud",
        plan: tenant?.plan || "enterprise",
        git: {
          branch: gitBranch,
          commit: gitCommit,
          dirty: gitDirty,
        },
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(uptimeSeconds),
        stats: {
          clusters: clusterCount,
          users: userCount,
        },
        license: {
          status: "active",
          tier: "Enterprise Multi-Cluster Unlimited",
          issuedTo: tenant?.name || "Administrador",
          expiresAt: "Perpétua / Self-Hosted",
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Apenas administradores podem atualizar o sistema" }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "check_update") {
      try {
        await execAsync("git fetch origin", { timeout: 15000 });
        const { stdout: status } = await execAsync("git status -uno", { timeout: 5000 });
        const hasUpdates = status.includes("Your branch is behind");

        return NextResponse.json({
          ok: true,
          hasUpdates,
          statusMessage: hasUpdates ? "Nova versão disponível no repositório remoto!" : "O ICEWALL está atualizado.",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Falha ao verificar atualizações";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    }

    if (action === "apply_update") {
      await recordAuditLog({
        action: "system.update_trigger",
        detail: { triggeredBy: session.email },
      });

      // Procedural update: pull, rebuild e restart
      try {
        const { stdout: pullOut } = await execAsync("git pull", { timeout: 30000 });
        const { stdout: buildOut } = await execAsync("npm run build", { timeout: 120000 });

        // Agenda restart em background
        setTimeout(async () => {
          try {
            await execAsync("systemctl --user restart icewall");
          } catch {
            // ignore
          }
        }, 1000);

        return NextResponse.json({
          ok: true,
          message: "Atualização aplicada com sucesso! O sistema está sendo reiniciado.",
          details: `${pullOut}\n${buildOut}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro na aplicação do update";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: false, error: "Ação não suportada" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

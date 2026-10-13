import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { recordAuditLog } from "@/server/auth/audit";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Apenas administradores podem baixar backups" }, { status: 403 });
    }

    const dbPath = path.join(process.cwd(), "data", "icewall.db");
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ ok: false, error: "Arquivo de banco de dados não encontrado" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(dbPath);

    await recordAuditLog({
      action: "system.backup_download",
      detail: { sizeBytes: fileBuffer.length },
    });

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="icewall-backup-${new Date().toISOString().slice(0, 10)}.sqlite"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

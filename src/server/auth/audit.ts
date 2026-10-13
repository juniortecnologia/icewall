import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasAuditLogs } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";

export interface LogAuditParams {
  action: string;
  detail?: string | Record<string, unknown>;
  ip?: string;
  userId?: string;
  userName?: string;
  tenantId?: string;
}

export async function recordAuditLog(params: LogAuditParams) {
  try {
    const session = await getSession();
    const tenantId = params.tenantId || session?.tenantId || "tenant_default_01";
    const userId = params.userId || session?.userId || null;
    const userName = params.userName || session?.name || "Sistema";

    const detailStr = typeof params.detail === "object" ? JSON.stringify(params.detail) : (params.detail || null);

    const db = getDb();
    db.insert(saasAuditLogs).values({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      userId,
      userName,
      action: params.action,
      detail: detailStr,
      ip: params.ip || "127.0.0.1",
      createdAt: sqlDateNow(),
    }).run();
  } catch (err) {
    console.warn("[recordAuditLog] error recording log:", err);
  }
}

function sqlDateNow(): number {
  return Date.now();
}

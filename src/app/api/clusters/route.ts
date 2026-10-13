import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saasClusters } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { ensureInitialTenantAndAdmin } from "@/server/auth/init";

export async function GET() {
  try {
    ensureInitialTenantAndAdmin();
    const session = await getSession();
    const tenantId = session?.tenantId || "tenant_default_01";

    const db = getDb();
    const clusters = db.select().from(saasClusters).where(eq(saasClusters.tenantId, tenantId)).all();

    return NextResponse.json({ ok: true, clusters });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    ensureInitialTenantAndAdmin();
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { name, type, endpoint, sshHost, sshPort, sshUser, gpuModel, totalMemoryGb } = body;

    if (!name || !endpoint) {
      return NextResponse.json({ ok: false, error: "Nome e endpoint são obrigatórios" }, { status: 400 });
    }

    const db = getDb();
    const newCluster = {
      id: `cluster_${Date.now()}`,
      tenantId: session.tenantId,
      name,
      type: type || "dgx-spark",
      endpoint,
      sshHost: sshHost || "10.0.5.8",
      sshPort: Number(sshPort) || 22,
      sshUser: sshUser || "junior",
      status: "online",
      gpuModel: gpuModel || "NVIDIA GB10 Blackwell (Spark)",
      totalMemoryGb: Number(totalMemoryGb) || 128,
      activeModelsCount: 0,
    };

    db.insert(saasClusters).values(newCluster).run();

    return NextResponse.json({ ok: true, cluster: newCluster });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { saasClusters } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { ensureInitialTenantAndAdmin } from "@/server/auth/init";
import { validationError, errorResponse } from "@/server/api";

const clusterCreateSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: z.string().url(),
  type: z.enum(["dgx-spark", "cloud-gpu", "local-pc"]).optional(),
  sshHost: z.string().optional(),
  sshPort: z.coerce.number().int().min(1).max(65535).optional(),
  sshUser: z.string().optional(),
  gpuModel: z.string().optional(),
  totalMemoryGb: z.coerce.number().int().positive().optional(),
});

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

    const rawBody = await req.json().catch(() => null);
    const parsed = clusterCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      return validationError("Payload inválido: " + issues.map((e) => e.message).join(", "));
    }

    const { name, endpoint, type, sshHost, sshPort, sshUser, gpuModel, totalMemoryGb } = parsed.data;

    const db = getDb();
    const newCluster = {
      id: `cluster_${Date.now()}`,
      tenantId: session.tenantId,
      name,
      type: type || "dgx-spark",
      endpoint,
      sshHost: sshHost || "10.0.5.18",
      sshPort: sshPort || 22,
      sshUser: sshUser || "facini",
      status: "online",
      gpuModel: gpuModel || "NVIDIA GB10 Blackwell (Spark)",
      totalMemoryGb: totalMemoryGb || 128,
      activeModelsCount: 0,
    };

    db.insert(saasClusters).values(newCluster).run();

    return NextResponse.json({ ok: true, cluster: newCluster });
  } catch (err) {
    return errorResponse(err, "clusters/post");
  }
}

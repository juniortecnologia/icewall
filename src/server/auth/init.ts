import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { saasTenants, saasUsers, saasClusters } from "../db/schema";
import { hashPassword } from "./crypto";

let initialized = false;

/**
 * Ensures default tenant, admin user and spark cluster exist.
 * This runs automatically on application startup.
 */
export function ensureInitialTenantAndAdmin() {
  if (initialized) return;
  try {
    const db = getDb();
    
    // Check if default tenant exists
    const existingTenant = db.select().from(saasTenants).where(eq(saasTenants.slug, "default")).get();
    
    const tenantId = existingTenant?.id ?? "tenant_default_01";
    if (!existingTenant) {
      db.insert(saasTenants).values({
        id: tenantId,
        slug: "default",
        name: "ICEWALL Master Cloud",
        plan: "enterprise",
      }).run();
    }

    // Check if admin user exists
    const adminEmail = process.env.ICEWALL_ADMIN_EMAIL || "admin@icewall.ai";
    const existingUser = db.select().from(saasUsers).where(eq(saasUsers.email, adminEmail)).get();

    if (!existingUser) {
      const adminPass = process.env.ICEWALL_ADMIN_PASSWORD || "AdminPass123!";
      db.insert(saasUsers).values({
        id: "user_admin_01",
        tenantId,
        email: adminEmail,
        name: "Administrador ICEWALL",
        passwordHash: hashPassword(adminPass),
        role: "admin",
        twoFactorEnabled: false,
      }).run();
    }

    // Check if default local cluster exists
    const existingCluster = db.select().from(saasClusters).where(eq(saasClusters.tenantId, tenantId)).get();
    if (!existingCluster) {
      db.insert(saasClusters).values({
        id: "cluster_spark_01",
        tenantId,
        name: "NVIDIA Spark Node #1 (Local)",
        type: "dgx-spark",
        endpoint: "http://10.0.5.18:11434",
        sshHost: "10.0.5.18",
        sshPort: 22,
        sshUser: "facini",
        status: "online",
        gpuModel: "NVIDIA GB10 Blackwell (Spark)",
        totalMemoryGb: 128,
        activeModelsCount: 5,
      }).run();
    } else if (existingCluster.sshHost === "10.0.5.8" || existingCluster.endpoint?.includes("10.0.5.8") || existingCluster.sshUser === "junior") {
      db.update(saasClusters)
        .set({
          endpoint: "http://10.0.5.18:11434",
          sshHost: "10.0.5.18",
          sshUser: "facini",
        })
        .where(eq(saasClusters.id, existingCluster.id))
        .run();
    }

    initialized = true;
  } catch (err) {
    console.warn("[ensureInitialTenantAndAdmin] error:", err);
  }
}

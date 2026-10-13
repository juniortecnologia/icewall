import { describe, it, expect } from "vitest";
import { getDb } from "../db/client";
import { saasUsers, saasAuditLogs } from "../db/schema";
import { hashPassword } from "./crypto";
import { eq } from "drizzle-orm";

describe("SaaS Admin & User CRUD operations", () => {
  it("should create, read, update role, and delete a test user in database", () => {
    const db = getDb();
    const testUserId = `test_user_${Date.now()}`;
    const testEmail = `tester_${Date.now()}@icewall.ai`;

    // 1. Create
    db.insert(saasUsers)
      .values({
        id: testUserId,
        tenantId: "tenant_default_01",
        email: testEmail,
        name: "Test Operator",
        passwordHash: hashPassword("Secret123!"),
        role: "operator",
        twoFactorEnabled: false,
      })
      .run();

    const created = db.select().from(saasUsers).where(eq(saasUsers.id, testUserId)).get();
    expect(created).toBeDefined();
    expect(created?.name).toBe("Test Operator");
    expect(created?.role).toBe("operator");

    // 2. Update role to admin
    db.update(saasUsers)
      .set({ role: "admin", twoFactorEnabled: true })
      .where(eq(saasUsers.id, testUserId))
      .run();

    const updated = db.select().from(saasUsers).where(eq(saasUsers.id, testUserId)).get();
    expect(updated?.role).toBe("admin");
    expect(updated?.twoFactorEnabled).toBe(true);

    // 3. Delete
    db.delete(saasUsers).where(eq(saasUsers.id, testUserId)).run();
    const deleted = db.select().from(saasUsers).where(eq(saasUsers.id, testUserId)).get();
    expect(deleted).toBeUndefined();
  });

  it("should record and query audit logs correctly", () => {
    const db = getDb();
    const testAuditId = `audit_test_${Date.now()}`;

    db.insert(saasAuditLogs)
      .values({
        id: testAuditId,
        tenantId: "tenant_default_01",
        action: "test.admin_action",
        userName: "Admin Tester",
        detail: JSON.stringify({ key: "val" }),
        ip: "127.0.0.1",
      })
      .run();

    const log = db.select().from(saasAuditLogs).where(eq(saasAuditLogs.id, testAuditId)).get();
    expect(log).toBeDefined();
    expect(log?.action).toBe("test.admin_action");
    expect(log?.userName).toBe("Admin Tester");

    // Clean up
    db.delete(saasAuditLogs).where(eq(saasAuditLogs.id, testAuditId)).run();
  });
});

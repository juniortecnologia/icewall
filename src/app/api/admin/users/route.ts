import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/crypto";
import { recordAuditLog } from "@/server/auth/audit";
import { ensureInitialTenantAndAdmin } from "@/server/auth/init";
import { withAdminAuth } from "@/server/auth/withAuth";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
});

export const GET = withAdminAuth(async (req) => {
  ensureInitialTenantAndAdmin();
  const db = getDb();
  const users = db
    .select({
      id: saasUsers.id,
      tenantId: saasUsers.tenantId,
      name: saasUsers.name,
      email: saasUsers.email,
      role: saasUsers.role,
      twoFactorEnabled: saasUsers.twoFactorEnabled,
      createdAt: saasUsers.createdAt,
      updatedAt: saasUsers.updatedAt,
    })
    .from(saasUsers)
    .where(eq(saasUsers.tenantId, req.session.tenantId))
    .orderBy(desc(saasUsers.createdAt))
    .all();

  return NextResponse.json({ ok: true, users });
});

export const POST = withAdminAuth(async (req) => {
  ensureInitialTenantAndAdmin();
  const { name, email, password, role } = req.validatedBody!;

  const db = getDb();
  const existing = db.select().from(saasUsers).where(eq(saasUsers.email, email.toLowerCase().trim())).get();
  if (existing) {
    return NextResponse.json({ ok: false, error: "Já existe um usuário cadastrado com este e-mail" }, { status: 409 });
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  db.insert(saasUsers).values({
    id: userId,
    tenantId: req.session.tenantId,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash: hashPassword(password),
    role: role || "operator",
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
  }).run();

  await recordAuditLog({
    action: "user.create",
    detail: { userId, name: name.trim(), email: email.toLowerCase().trim(), role: role || "operator" },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: userId,
      tenantId: req.session.tenantId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: role || "operator",
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    },
  });
}, { bodySchema: createUserSchema });

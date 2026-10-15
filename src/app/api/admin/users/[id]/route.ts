import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { saasUsers } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/crypto";
import { recordAuditLog } from "@/server/auth/audit";
import { validationError, errorResponse } from "@/server/api";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const userUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
});

const userActionSchema = z.object({
  action: z.enum(["reset_password", "reset_2fa"]),
  newPassword: z.string().min(6).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Apenas administradores podem atualizar usuários" }, { status: 403 });
    }

    const { id } = await params;
    const rawBody = await req.json().catch(() => null);
    const parsed = userUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      return validationError("Payload inválido: " + issues.map((e) => e.message).join(", "));
    }
    const { name, email, role } = parsed.data;

    const db = getDb();
    const user = db.select().from(saasUsers).where(and(eq(saasUsers.id, id), eq(saasUsers.tenantId, session.tenantId))).get();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 404 });
    }

    const updates: Partial<typeof saasUsers.$inferInsert> = {
      updatedAt: Date.now(),
    };

    if (name) updates.name = name.trim();
    if (email) updates.email = email.toLowerCase().trim();
    if (role) {
      // Impede que o próprio admin retire seu próprio papel de admin
      if (user.id === session.userId && role !== "admin") {
        return NextResponse.json({ ok: false, error: "Você não pode revogar seu próprio privilégio de admin" }, { status: 400 });
      }
      updates.role = role;
    }

    db.update(saasUsers).set(updates).where(eq(saasUsers.id, id)).run();

    await recordAuditLog({
      action: "user.update",
      detail: { targetUserId: id, updates },
    });

    return NextResponse.json({ ok: true, user: { ...user, ...updates } });
  } catch (err) {
    return errorResponse(err, "admin/users/[id]/put");
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Apenas administradores podem realizar esta ação" }, { status: 403 });
    }

    const { id } = await params;
    const rawBody = await req.json().catch(() => null);
    const parsed = userActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      return validationError("Payload inválido: " + issues.map((e) => e.message).join(", "));
    }
    const { action, newPassword } = parsed.data;

    const db = getDb();
    const user = db.select().from(saasUsers).where(and(eq(saasUsers.id, id), eq(saasUsers.tenantId, session.tenantId))).get();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 404 });
    }

    if (action === "reset_password") {
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ ok: false, error: "A nova senha deve ter pelo menos 6 caracteres" }, { status: 400 });
      }

      db.update(saasUsers)
        .set({
          passwordHash: hashPassword(newPassword),
          updatedAt: Date.now(),
        })
        .where(eq(saasUsers.id, id))
        .run();

      await recordAuditLog({
        action: "user.reset_password",
        detail: { targetUserId: id, targetEmail: user.email },
      });

      return NextResponse.json({ ok: true, message: "Senha redefinida com sucesso" });
    }

    if (action === "reset_2fa") {
      db.update(saasUsers)
        .set({
          twoFactorEnabled: false,
          twoFactorSecret: null,
          updatedAt: Date.now(),
        })
        .where(eq(saasUsers.id, id))
        .run();

      await recordAuditLog({
        action: "user.reset_2fa",
        detail: { targetUserId: id, targetEmail: user.email },
      });

      return NextResponse.json({ ok: true, message: "2FA revogado e desativado com sucesso" });
    }

    return NextResponse.json({ ok: false, error: "Ação não suportada" }, { status: 400 });
  } catch (err) {
    return errorResponse(err, "admin/users/[id]/patch");
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Apenas administradores podem excluir usuários" }, { status: 403 });
    }

    const { id } = await params;

    if (id === session.userId) {
      return NextResponse.json({ ok: false, error: "Não é permitido excluir o usuário atualmente conectado" }, { status: 400 });
    }

    const db = getDb();
    const user = db.select().from(saasUsers).where(and(eq(saasUsers.id, id), eq(saasUsers.tenantId, session.tenantId))).get();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 404 });
    }

    db.delete(saasUsers).where(eq(saasUsers.id, id)).run();

    await recordAuditLog({
      action: "user.delete",
      detail: { deletedUserId: id, email: user.email, name: user.name },
    });

    return NextResponse.json({ ok: true, message: "Usuário excluído com sucesso" });
  } catch (err) {
    return errorResponse(err, "admin/users/[id]/delete");
  }
}

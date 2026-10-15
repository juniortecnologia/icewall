import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { recordAuditLog } from "@/server/auth/audit";
import { validationError, errorResponse } from "@/server/api";

interface NotificationConfig {
  discordWebhook?: string;
  slackWebhook?: string;
  emailAlertsEnabled?: boolean;
  alertEmail?: string;
  notifyOnGpuThreshold?: boolean;
  gpuThresholdPct?: number;
  notifyOnContainerFail?: boolean;
  notifyOnJevAnomaly?: boolean;
}

const SETTINGS_KEY = "notification_config";

// Zod schemas for validation
const notificationConfigSchema = z.object({
  discordWebhook: z.string().url().optional().or(z.literal("")),
  slackWebhook: z.string().url().optional().or(z.literal("")),
  emailAlertsEnabled: z.boolean().optional(),
  alertEmail: z.string().email().optional().or(z.literal("")),
  notifyOnGpuThreshold: z.boolean().optional(),
  gpuThresholdPct: z.number().int().min(1).max(100).optional(),
  notifyOnContainerFail: z.boolean().optional(),
  notifyOnJevAnomaly: z.boolean().optional(),
});

const testWebhookSchema = z.object({
  action: z.literal("test_webhook"),
  webhookUrl: z.string().url(),
});

const saveConfigSchema = z.object({
  action: z.literal("save_config").optional(),
  config: notificationConfigSchema,
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const db = getDb();
    const row = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
    const config: NotificationConfig = (row?.value as NotificationConfig) || {
      discordWebhook: "",
      slackWebhook: "",
      emailAlertsEnabled: false,
      alertEmail: session.email || "",
      notifyOnGpuThreshold: true,
      gpuThresholdPct: 90,
      notifyOnContainerFail: true,
      notifyOnJevAnomaly: true,
    };

    return NextResponse.json({ ok: true, config });
  } catch (err: unknown) {
    return errorResponse(err, "notifications/get");
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Apenas administradores podem alterar configurações" }, { status: 403 });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return validationError("Payload inválido");
    }

    // Test webhook action
    const testWebhookParsed = testWebhookSchema.safeParse(rawBody);
    if (testWebhookParsed.success) {
      return await testWebhook(session, testWebhookParsed.data.webhookUrl);
    }

    // Save config action
    const saveConfigParsed = saveConfigSchema.safeParse(rawBody);
    if (!saveConfigParsed.success) {
      const issues = saveConfigParsed.error.issues;
      return validationError("Payload inválido: " + issues.map((e) => e.message).join(", "));
    }

    return await saveConfig(session, saveConfigParsed.data.config);
  } catch (err) {
    return errorResponse(err, "notifications/post");
  }
}

async function testWebhook(session: { email: string }, webhookUrl: string) {
  // SSRF protection: block private/internal IPs
  try {
    const url = new URL(webhookUrl);
    const hostname = url.hostname;
    
    // Block private IP ranges and localhost
    const blockedPatterns = [
      /^127\./,           // Loopback
      /^10\./,            // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
      /^192\.168\./,      // 192.168.0.0/16
      /^169\.254\./,      // Link-local
      /^::1$/,            // IPv6 loopback
      /^fc00:/,           // IPv6 unique local
      /^fe80:/,           // IPv6 link-local
      /^localhost$/i,     // Localhost hostname
    ];
    
    if (blockedPatterns.some(pattern => pattern.test(hostname))) {
      return validationError("Webhook URL não pode apontar para rede interna ou localhost");
    }
    
    // Only allow HTTP/HTTPS
    if (!["http:", "https:"].includes(url.protocol)) {
      return validationError("Webhook deve usar HTTP ou HTTPS");
    }
  } catch {
    return validationError("URL de webhook inválida");
  }

  try {
    const testPayload = {
      content: "🧊 **ICEWALL Alerta de Teste**: O canal de notificações foi configurado e validado com sucesso!",
      text: "🧊 ICEWALL Alerta de Teste: O canal de notificações foi configurado com sucesso!",
    };

    // Timeout protection (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `Webhook retornou status HTTP ${res.status}` }, { status: 400 });
      }

      return NextResponse.json({ ok: true, message: "Mensagem de teste enviada com sucesso!" });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        return NextResponse.json({ ok: false, error: "Timeout: webhook não respondeu em 5 segundos" }, { status: 408 });
      }
      throw fetchErr;
    }
  } catch (err) {
    return errorResponse(err, "notifications/test_webhook");
  }
}

async function saveConfig(session: { email: string }, config: NotificationConfig) {
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();

  if (existing) {
    db.update(settings).set({ value: config }).where(eq(settings.key, SETTINGS_KEY)).run();
  } else {
    db.insert(settings).values({ key: SETTINGS_KEY, value: config }).run();
  }

  await recordAuditLog({
    action: "settings.notifications_update",
    detail: { updatedBy: session.email },
  });

  return NextResponse.json({ ok: true, config });
}

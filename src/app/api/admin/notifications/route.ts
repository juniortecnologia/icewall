import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { recordAuditLog } from "@/server/auth/audit";

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
      return NextResponse.json({ ok: false, error: "Apenas administradores podem alterar configurações" }, { status: 403 });
    }

    const body = await req.json();
    const { action, config } = body;

    if (action === "test_webhook") {
      const webhookUrl = body.webhookUrl;
      if (!webhookUrl || !webhookUrl.startsWith("http")) {
        return NextResponse.json({ ok: false, error: "URL de webhook inválida" }, { status: 400 });
      }

      try {
        const testPayload = {
          content: "🧊 **ICEWALL Alerta de Teste**: O canal de notificações foi configurado e validado com sucesso!",
          text: "🧊 ICEWALL Alerta de Teste: O canal de notificações foi configurado com sucesso!",
        };

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload),
        });

        if (!res.ok) {
          return NextResponse.json({ ok: false, error: `Webhook retornou status HTTP ${res.status}` }, { status: 400 });
        }

        return NextResponse.json({ ok: true, message: "Mensagem de teste enviada com sucesso!" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Falha na conexão do webhook";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    }

    // Salvar configurações
    if (!config || typeof config !== "object") {
      return NextResponse.json({ ok: false, error: "Configuração ausente" }, { status: 400 });
    }

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

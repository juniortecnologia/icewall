"use client";

import { useState, FormEvent } from "react";
import { Bell, Activity, Shield } from "lucide-react";
import { NotificationConfig, ToastMessage } from "./SettingsTypes";
import { SettingsToast } from "./SettingsToast";

interface NotificationsTabProps {
  activeTab: string;
  showToast: (text: string, type?: "success" | "error") => void;
  toastMessage: ToastMessage | null;
  setToastMessage: (msg: ToastMessage | null) => void;
}

export function NotificationsTab({ activeTab, showToast, toastMessage, setToastMessage }: NotificationsTabProps) {
  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>({
    discordWebhook: "",
    slackWebhook: "",
    emailAlertsEnabled: false,
    alertEmail: "",
    notifyOnGpuThreshold: true,
    gpuThresholdPct: 90,
    notifyOnContainerFail: true,
    notifyOnJevAnomaly: true,
  });
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [webhookTestStatus, setWebhookTestStatus] = useState<string | null>(null);

  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/admin/notifications", { method: "GET" });
      const data = await res.json();
      if (data.ok && data.config) setNotificationConfig(data.config);
    } catch {
      // ignore
    }
  };

  const handleSaveNotifications = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSavingNotifications(true);
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: notificationConfig }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Configurações de alerta salvas com sucesso!");
      } else {
        showToast(data.error || "Erro ao salvar", "error");
      }
    } catch {
      showToast("Erro ao conectar à API", "error");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!notificationConfig.discordWebhook && !notificationConfig.slackWebhook) {
      showToast("Preencha ao menos uma URL de webhook para testar", "error");
      return;
    }
    const targetUrl = notificationConfig.discordWebhook || notificationConfig.slackWebhook;
    try {
      setWebhookTestStatus("Enviando disparo de teste...");
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_webhook", webhookUrl: targetUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setWebhookTestStatus("Mensagem de teste enviada com sucesso!");
        showToast("Webhook validado com sucesso!");
      } else {
        setWebhookTestStatus(`Erro: ${data.error}`);
        showToast(data.error || "Falha no teste", "error");
      }
    } catch {
      setWebhookTestStatus("Falha na requisição de teste");
      showToast("Falha na requisição", "error");
    }
  };

  if (activeTab !== "notifications") return null;

  return (
    <>
      <SettingsToast message={toastMessage} onClose={() => setToastMessage(null)} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Webhooks e Alertas */}
        <div className="bg-surface border border-line rounded-xl p-5 space-y-4 shadow-xs">
          <div>
            <h2 className="text-sm font-semibold text-ink">Canais de Notificação & Webhooks</h2>
            <p className="text-xs text-ink-3">Receba avisos em tempo real no Discord, Slack ou Email para incidentes de IA.</p>
          </div>

          <form onSubmit={handleSaveNotifications} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Webhook Discord</label>
              <input
                type="url"
                value={notificationConfig.discordWebhook}
                onChange={(e) => setNotificationConfig({ ...notificationConfig, discordWebhook: e.target.value })}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-ice font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Webhook Slack</label>
              <input
                type="url"
                value={notificationConfig.slackWebhook}
                onChange={(e) => setNotificationConfig({ ...notificationConfig, slackWebhook: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-ice font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Email para Alertas Críticos</label>
              <input
                type="email"
                value={notificationConfig.alertEmail}
                onChange={(e) => setNotificationConfig({ ...notificationConfig, alertEmail: e.target.value })}
                placeholder="admin@empresa.com"
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-ice font-mono"
              />
            </div>

            <div className="pt-2 border-t border-line-soft space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">Gatilhos de Notificação</div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationConfig.notifyOnGpuThreshold}
                  onChange={(e) => setNotificationConfig({ ...notificationConfig, notifyOnGpuThreshold: e.target.checked })}
                  className="rounded border-line bg-surface-2 text-ice"
                />
                <span className="text-xs text-ink-2">Alertar quando uso de GPU / VRAM exceder 90%</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationConfig.notifyOnContainerFail}
                  onChange={(e) => setNotificationConfig({ ...notificationConfig, notifyOnContainerFail: e.target.checked })}
                  className="rounded border-line bg-surface-2 text-ice"
                />
                <span className="text-xs text-ink-2">Alertar quando container de inferência (vLLM / Ollama) reiniciar ou cair</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationConfig.notifyOnJevAnomaly}
                  onChange={(e) => setNotificationConfig({ ...notificationConfig, notifyOnJevAnomaly: e.target.checked })}
                  className="rounded border-line bg-surface-2 text-ice"
                />
                <span className="text-xs text-ink-2">Notificar anomalias e quebra de regras detectadas pelo Auditor JEV</span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-line-soft">
              <button
                type="button"
                onClick={handleTestWebhook}
                className="px-3 py-1.5 bg-surface-2 hover:bg-surface-2/80 text-xs font-medium rounded-lg text-ink border border-line transition-colors cursor-pointer"
              >
                Testar Envio
              </button>
              <button
                type="submit"
                disabled={savingNotifications}
                className="px-4 py-1.5 bg-ice hover:bg-ice/90 text-white text-xs font-medium rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                {savingNotifications ? "Salvando..." : "Salvar Configurações"}
              </button>
            </div>

            {webhookTestStatus && (
              <div className="text-[11px] p-2 rounded bg-surface-2/60 border border-line font-mono text-ink-3">
                {webhookTestStatus}
              </div>
            )}
          </form>
        </div>

        {/* Matriz RBAC */}
        <div className="bg-surface border border-line rounded-xl p-5 space-y-4 shadow-xs">
          <div>
            <h2 className="text-sm font-semibold text-ink">Matriz de Permissões (RBAC)</h2>
            <p className="text-xs text-ink-3">Definição dos privilégios de acesso associados a cada perfil.</p>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase text-purple-400">Admin</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-medium">Acesso Total</span>
              </div>
              <p className="text-xs text-ink-3">
                Controle irrestrito: criar e remover servidores, cadastrar e gerenciar usuários, redefinir senhas e 2FA, executar comandos no shell remoto/local, baixar backups e atualizar o ICEWALL.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase text-blue-400">Operator</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-medium">Operação de Modelos</span>
              </div>
              <p className="text-xs text-ink-3">
                Gestão de modelos e variantes locais do Ollama/vLLM, execução de benchmarks, bancada de testes, acesso ao terminal com alvos configurados e aplicação de recomendações do JEV.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-slate-500/20 bg-slate-500/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase text-slate-400">Viewer</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-300 font-medium">Somente Leitura</span>
              </div>
              <p className="text-xs text-ink-3">
                Visualização da telemetria em tempo real, consumo de tokens, métricas da GPU e auditoria. Sem permissão de execução de shell ou alteração de configurações.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
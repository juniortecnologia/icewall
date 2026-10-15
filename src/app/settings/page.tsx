"use client";

import { useEffect, useState, useRef } from "react";
import { Users, Bell, Activity, HardDrive, CheckCircle, XCircle } from "lucide-react";
import { SettingsTabs } from "./components/SettingsTabs";
import { UsersTab } from "./components/UsersTab";
import { NotificationsTab } from "./components/NotificationsTab";
import { AuditTab } from "./components/AuditTab";
import { SystemTab } from "./components/SystemTab";
import { SettingsSection, ToastMessage } from "./components/SettingsTypes";

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "users",
    label: "Usuários & Acesso",
    description: "Gerenciamento de contas, papéis e segurança 2FA",
    icon: Users,
    color: "text-ice",
  },
  {
    id: "notifications",
    label: "Notificações & RBAC",
    description: "Webhooks (Discord/Slack), e-mails e regras de acesso",
    icon: Bell,
    color: "text-amber-400",
  },
  {
    id: "audit",
    label: "Auditoria & Logs",
    description: "Rastreabilidade de ações administrativas e eventos",
    icon: Activity,
    color: "text-emerald-400",
  },
  {
    id: "system",
    label: "Sistema & Backup",
    description: "Snapshot do banco SQLite, licença e atualizações",
    icon: HardDrive,
    color: "text-indigo-400",
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsSection["id"]>("users");
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Carregar dados ao mudar de aba
  useEffect(() => {
    // O carregamento é feito dentro de cada componente de aba
    // quando o activeTab muda
  }, [activeTab]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl border flex items-center gap-2.5 text-xs font-medium backdrop-blur-md transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/80 border-rose-500/40 text-rose-200"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-line">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-xl font-bold text-ink tracking-tight">Painel de Configurações & Administração</h1>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ice/10 text-ice border border-ice/20">
              Admin Core
            </span>
          </div>
          <p className="text-xs text-ink-3">
            Governança da plataforma, gestão de usuários, papéis RBAC, notificações e manutenção procedural do ICEWALL.
          </p>
        </div>

        {/* Menu Suspenso / Botão Hambúrguer */}
        <SettingsTabs
          sections={SETTINGS_SECTIONS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Content Tabs */}
      <UsersTab
        activeTab={activeTab}
        showToast={showToast}
        toastMessage={toastMessage}
        setToastMessage={setToastMessage}
      />
      <NotificationsTab
        activeTab={activeTab}
        showToast={showToast}
        toastMessage={toastMessage}
        setToastMessage={setToastMessage}
      />
      <AuditTab
        activeTab={activeTab}
        showToast={showToast}
        toastMessage={toastMessage}
        setToastMessage={setToastMessage}
      />
      <SystemTab
        activeTab={activeTab}
        showToast={showToast}
        toastMessage={toastMessage}
        setToastMessage={setToastMessage}
      />
    </div>
  );
}
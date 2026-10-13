"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Users,
  Shield,
  Bell,
  HardDrive,
  Activity,
  Plus,
  Trash2,
  Key,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  GitBranch,
  Info,
  Clock,
  Layers,
  Sparkles,
  Lock,
  Unlock,
  Menu,
  ChevronDown,
  Check,
} from "lucide-react";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AuditLogItem {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  createdAt: number;
}

interface SystemData {
  version: string;
  edition: string;
  tenant: string;
  plan: string;
  git: {
    branch: string;
    commit: string;
    dirty: boolean;
  };
  nodeVersion: string;
  platform: string;
  uptimeSeconds: number;
  stats: {
    clusters: number;
    users: number;
  };
  license: {
    status: string;
    tier: string;
    issuedTo: string;
    expiresAt: string;
  };
}

interface NotificationConfig {
  discordWebhook: string;
  slackWebhook: string;
  emailAlertsEnabled: boolean;
  alertEmail: string;
  notifyOnGpuThreshold: boolean;
  gpuThresholdPct: number;
  notifyOnContainerFail: boolean;
  notifyOnJevAnomaly: boolean;
}

const SETTINGS_SECTIONS = [
  {
    id: "users" as const,
    label: "Usuários & Acesso",
    description: "Gerenciamento de contas, papéis e segurança 2FA",
    icon: Users,
    color: "text-ice",
  },
  {
    id: "notifications" as const,
    label: "Notificações & RBAC",
    description: "Webhooks (Discord/Slack), e-mails e regras de acesso",
    icon: Bell,
    color: "text-amber-400",
  },
  {
    id: "audit" as const,
    label: "Auditoria & Logs",
    description: "Rastreabilidade de ações administrativas e eventos",
    icon: Activity,
    color: "text-emerald-400",
  },
  {
    id: "system" as const,
    label: "Sistema & Backup",
    description: "Snapshot do banco SQLite, licença e atualizações",
    icon: HardDrive,
    color: "text-indigo-400",
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"users" | "notifications" | "audit" | "system">("users");
  const [menuOpen, setMenuOpen] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("operator");

  // Reset password modal state
  const [resetPasswordModal, setResetPasswordModal] = useState<{ id: string; email: string } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // System state
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Notification state
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

  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Carregar Usuários
  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.ok) setUsers(data.users);
    } catch {
      showToast("Falha ao carregar usuários", "error");
    } finally {
      setLoadingUsers(false);
    }
  };

  // Carregar Auditoria
  const loadAudit = async () => {
    try {
      setLoadingAudit(true);
      const res = await fetch("/api/admin/audit?limit=60");
      const data = await res.json();
      if (data.ok) setAuditLogs(data.logs);
    } catch {
      showToast("Falha ao carregar auditoria", "error");
    } finally {
      setLoadingAudit(false);
    }
  };

  // Carregar Sistema
  const loadSystem = async () => {
    try {
      setLoadingSystem(true);
      const res = await fetch("/api/admin/system");
      const data = await res.json();
      if (data.ok) setSystemData(data.system);
    } catch {
      showToast("Falha ao obter status do sistema", "error");
    } finally {
      setLoadingSystem(false);
    }
  };

  // Carregar Notificações
  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      const data = await res.json();
      if (data.ok && data.config) setNotificationConfig(data.config);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (activeTab === "users") loadUsers();
    if (activeTab === "audit") loadAudit();
    if (activeTab === "system") loadSystem();
    if (activeTab === "notifications") loadNotifications();
  }, [activeTab]);

  // Criar Usuário
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Usuário criado com sucesso!");
        setShowAddUserModal(false);
        setNewUserName("");
        setNewUserEmail("");
        setNewUserPassword("");
        loadUsers();
      } else {
        showToast(data.error || "Erro ao criar usuário", "error");
      }
    } catch {
      showToast("Erro ao conectar à API", "error");
    }
  };

  // Resetar Senha
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordModal) return;
    try {
      const res = await fetch(`/api/admin/users/${resetPasswordModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          newPassword: resetNewPassword,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Senha redefinida com sucesso!");
        setResetPasswordModal(null);
        setResetNewPassword("");
      } else {
        showToast(data.error || "Erro ao redefinir senha", "error");
      }
    } catch {
      showToast("Erro ao conectar à API", "error");
    }
  };

  // Resetar 2FA
  const handleReset2FA = async (userId: string, email: string) => {
    if (!confirm(`Deseja revogar e desativar o 2FA para o usuário ${email}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_2fa" }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("2FA revogado com sucesso!");
        loadUsers();
      } else {
        showToast(data.error || "Erro ao revogar 2FA", "error");
      }
    } catch {
      showToast("Erro ao conectar à API", "error");
    }
  };

  // Excluir Usuário
  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário ${email}? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        showToast("Usuário excluído com sucesso!");
        loadUsers();
      } else {
        showToast(data.error || "Erro ao excluir usuário", "error");
      }
    } catch {
      showToast("Erro ao conectar à API", "error");
    }
  };

  // Salvar Notificações
  const handleSaveNotifications = async (e: React.FormEvent) => {
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

  // Testar Webhook
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

  // Checar Atualizações
  const handleCheckUpdate = async () => {
    try {
      setUpdateStatus("Consultando repositório remoto...");
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_update" }),
      });
      const data = await res.json();
      if (data.ok) {
        setUpdateStatus(data.statusMessage);
      } else {
        setUpdateStatus(`Erro: ${data.error}`);
      }
    } catch {
      setUpdateStatus("Falha ao verificar atualizações");
    }
  };

  // Aplicar Atualização Procedural
  const handleApplyUpdate = async () => {
    if (!confirm("Deseja aplicar a atualização procedural agora? O sistema executará git pull, recompilará os assets e reiniciará o serviço.")) return;
    try {
      setIsUpdating(true);
      setUpdateStatus("Aplicando atualização (git pull + build)... Por favor aguarde.");
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_update" }),
      });
      const data = await res.json();
      if (data.ok) {
        setUpdateStatus("Atualização concluída! O ICEWALL está reiniciando.");
        showToast("Atualização aplicada com sucesso!");
      } else {
        setUpdateStatus(`Erro: ${data.error}`);
        showToast(data.error || "Falha na atualização", "error");
      }
    } catch {
      setUpdateStatus("Falha na execução do update");
      showToast("Falha na comunicação", "error");
    } finally {
      setIsUpdating(false);
    }
  };

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
          {toastMessage.type === "success" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
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
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface border border-line hover:border-line-soft text-ink font-medium text-xs transition-all shadow-xs cursor-pointer select-none"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label="Abrir menu de configurações"
          >
            <Menu className="w-4 h-4 text-ice" />
            <span className="text-ink-3 hidden sm:inline">Módulo:</span>
            <span className="font-semibold text-ink flex items-center gap-1.5">
              {(() => {
                const cur = SETTINGS_SECTIONS.find((s) => s.id === activeTab) || SETTINGS_SECTIONS[0];
                const Icon = cur.icon;
                return (
                  <>
                    <Icon className={`w-3.5 h-3.5 ${cur.color}`} />
                    <span>{cur.label}</span>
                  </>
                );
              })()}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-ink-3 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Menu Suspenso Flutuante */}
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-surface border border-line p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-ink-3 uppercase border-b border-line mb-1.5 flex items-center justify-between">
                  <span>Módulos de Configuração</span>
                  <span className="text-[10px] bg-ice/10 text-ice px-1.5 py-0.5 rounded font-mono">4 Seções</span>
                </div>
                <div className="space-y-1">
                  {SETTINGS_SECTIONS.map((sec) => {
                    const Icon = sec.icon;
                    const isSelected = activeTab === sec.id;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(sec.id);
                          setMenuOpen(false);
                        }}
                        className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-surface-2 text-ink border border-line-soft font-semibold shadow-xs"
                            : "hover:bg-surface-2/60 text-ink-2 hover:text-ink border border-transparent"
                        }`}
                      >
                        <div className={`p-2 rounded-lg bg-surface border border-line mt-0.5 shrink-0 ${sec.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-ink">{sec.label}</span>
                            {isSelected && (
                              <span className="flex items-center gap-1 text-[10px] text-ice font-semibold">
                                <Check className="w-3 h-3" /> Ativo
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">{sec.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* TAB 1: USUÁRIOS */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink">Usuários Cadastrados</h2>
              <p className="text-xs text-ink-3">Gerenciamento de contas com controle de papéis e segurança de 2 fatores.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadUsers}
                className="p-2 text-ink-3 hover:text-ink rounded-lg bg-surface-2 border border-line transition-colors cursor-pointer"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-ice hover:bg-ice/90 text-white rounded-lg text-xs font-medium transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Usuário</span>
              </button>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-2/40 text-ink-3 uppercase text-[10px] font-semibold tracking-wider">
                    <th className="py-3 px-4">Nome & Email</th>
                    <th className="py-3 px-4">Papel (RBAC)</th>
                    <th className="py-3 px-4">2FA (TOTP)</th>
                    <th className="py-3 px-4">Criado Em</th>
                    <th className="py-3 px-4 text-right">Ações de Segurança</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-ink-3">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-ink">{u.name}</div>
                          <div className="text-[11px] font-mono text-ink-3">{u.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              u.role === "admin"
                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                : u.role === "operator"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {u.twoFactorEnabled ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                              <Lock className="w-3 h-3" />
                              <span>Ativo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                              <Unlock className="w-3 h-3" />
                              <span>Desativado</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ink-3 font-mono text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => setResetPasswordModal({ id: u.id, email: u.email })}
                            className="p-1.5 text-ink-3 hover:text-amber-400 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
                            title="Redefinir senha"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          {u.twoFactorEnabled && (
                            <button
                              onClick={() => handleReset2FA(u.id, u.email)}
                              className="p-1.5 text-ink-3 hover:text-indigo-400 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
                              title="Revogar 2FA emergencial"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="p-1.5 text-ink-3 hover:text-rose-400 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
                            title="Excluir usuário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NOTIFICAÇÕES & RBAC */}
      {activeTab === "notifications" && (
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
      )}

      {/* TAB 3: AUDITORIA */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink">Histórico de Auditoria & Segurança</h2>
              <p className="text-xs text-ink-3">Rastreabilidade completa de todas as ações administrativas, alterações de usuários e eventos de sistema.</p>
            </div>
            <button
              onClick={loadAudit}
              className="p-2 text-ink-3 hover:text-ink rounded-lg bg-surface-2 border border-line transition-colors cursor-pointer"
              title="Atualizar logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-surface border-b border-line z-10">
                  <tr className="bg-surface-2/40 text-ink-3 uppercase text-[10px] font-semibold tracking-wider">
                    <th className="py-3 px-4">Data / Hora</th>
                    <th className="py-3 px-4">Usuário</th>
                    <th className="py-3 px-4">Ação</th>
                    <th className="py-3 px-4">IP</th>
                    <th className="py-3 px-4">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-ink-3">
                        Nenhum log de auditoria registrado ainda.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-2/30 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-ink-3 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-ink whitespace-nowrap">{log.userName || "Sistema"}</td>
                        <td className="py-2.5 px-4">
                          <span className="font-mono text-[11px] text-ice font-semibold">{log.action}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-ink-3 whitespace-nowrap">{log.ip || "-"}</td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-ink-2 truncate max-w-xs" title={log.detail || ""}>
                          {log.detail || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SISTEMA & BACKUP */}
      {activeTab === "system" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card Versão & Atualização */}
            <div className="bg-surface border border-line rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Versão Atual</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-ice/10 text-ice border border-ice/20">
                  {systemData?.version || "v1.3.0"}
                </span>
              </div>

              <div>
                <div className="text-lg font-bold text-ink">{systemData?.edition || "ICEWALL SaaS Core"}</div>
                <div className="flex items-center gap-1.5 text-xs text-ink-3 font-mono mt-1">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>
                    {systemData?.git.branch} ({systemData?.git.commit})
                  </span>
                  {systemData?.git.dirty && <span className="text-amber-400 font-sans text-[10px]">(modificado)</span>}
                </div>
              </div>

              <div className="pt-3 border-t border-line-soft space-y-2">
                <button
                  onClick={handleCheckUpdate}
                  className="w-full py-2 px-3 bg-surface-2 hover:bg-surface-2/80 text-ink rounded-lg text-xs font-medium border border-line transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-ice" />
                  <span>Verificar Atualizações</span>
                </button>

                <button
                  onClick={handleApplyUpdate}
                  disabled={isUpdating}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isUpdating ? "Atualizando..." : "Atualizar Proceduralmente"}</span>
                </button>
              </div>

              {updateStatus && (
                <div className="p-2.5 rounded-lg bg-surface-2/60 border border-line text-[11px] font-mono text-ink-2">
                  {updateStatus}
                </div>
              )}
            </div>

            {/* Card Backup & Restauração */}
            <div className="bg-surface border border-line rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Snapshot & Backup</span>
                <HardDrive className="w-4 h-4 text-indigo-400" />
              </div>

              <div>
                <div className="text-lg font-bold text-ink">Banco de Dados SQLite</div>
                <p className="text-xs text-ink-3 mt-1">
                  Exporte o banco de dados `icewall.db` completo contendo métricas, histórico de benchmarks, delegações e credenciais.
                </p>
              </div>

              <div className="pt-3 border-t border-line-soft">
                <a
                  href="/api/admin/backup"
                  download
                  className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Backup Completo</span>
                </a>
              </div>
            </div>

            {/* Card Licença & Tenant */}
            <div className="bg-surface border border-line rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Licença da Plataforma</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {systemData?.license.status || "Ativa"}
                </span>
              </div>

              <div>
                <div className="text-lg font-bold text-ink">{systemData?.license.tier || "Enterprise"}</div>
                <div className="text-xs text-ink-3 mt-1">Tenant: {systemData?.tenant}</div>
                <div className="text-xs text-ink-3">Validade: {systemData?.license.expiresAt}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-line-soft text-xs">
                <div className="p-2 rounded bg-surface-2/60 border border-line">
                  <div className="text-[10px] text-ink-3 uppercase">Clusters</div>
                  <div className="text-sm font-bold text-ink mt-0.5">{systemData?.stats.clusters ?? 1}</div>
                </div>
                <div className="p-2 rounded bg-surface-2/60 border border-line">
                  <div className="text-[10px] text-ink-3 uppercase">Usuários</div>
                  <div className="text-sm font-bold text-ink mt-0.5">{systemData?.stats.users ?? 1}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Usuário */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold text-ink mb-1">Cadastrar Novo Usuário</h2>
            <p className="text-xs text-ink-3 mb-4">Insira os dados cadastrais e defina a permissão de acesso.</p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="ex: Carlos Mendes"
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-ice"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">E-mail</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="carlos@empresa.com"
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-ice font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Senha Inicial</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Pelo menos 6 caracteres"
                  required
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-ice font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Papel de Acesso (RBAC)</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-ice"
                >
                  <option value="operator">Operator (Gestão de Modelos & Terminal)</option>
                  <option value="admin">Admin (Controle Total & Configurações)</option>
                  <option value="viewer">Viewer (Somente Leitura)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-line-soft">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 text-xs font-medium text-ink-3 hover:text-ink rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-ice hover:bg-ice/90 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redefinir Senha */}
      {resetPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-base font-bold text-ink mb-1">Redefinir Senha</h2>
            <p className="text-xs text-ink-3 mb-4">
              Defina a nova senha para <strong className="text-ink">{resetPasswordModal.email}</strong>.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Nova Senha</label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-ice font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-line-soft">
                <button
                  type="button"
                  onClick={() => {
                    setResetPasswordModal(null);
                    setResetNewPassword("");
                  }}
                  className="px-4 py-2 text-xs font-medium text-ink-3 hover:text-ink rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  Confirmar Nova Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

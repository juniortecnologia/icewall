"use client";

import { useState } from "react";
import { Plus, Trash2, Key, Unlock, Lock, RefreshCw } from "lucide-react";
import { UserItem, ToastMessage } from "./SettingsTypes";
import { SettingsToast } from "./SettingsToast";

interface UsersTabProps {
  activeTab: string;
  showToast: (text: string, type?: "success" | "error") => void;
  toastMessage: ToastMessage | null;
  setToastMessage: (msg: ToastMessage | null) => void;
}

export function UsersTab({ activeTab, showToast, toastMessage, setToastMessage }: UsersTabProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("operator");
  const [resetPasswordModal, setResetPasswordModal] = useState<{ id: string; email: string } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch("/api/admin/users", { method: "GET" });
      const data = await res.json();
      if (data.ok) setUsers(data.users);
    } catch {
      showToast("Falha ao carregar usuários", "error");
    } finally {
      setLoadingUsers(false);
    }
  };

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

  if (activeTab !== "users") return null;

  return (
    <>
      <SettingsToast message={toastMessage} onClose={() => setToastMessage(null)} />
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
    </>
  );
}
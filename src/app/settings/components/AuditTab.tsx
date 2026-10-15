"use client";

import { useState } from "react";
import { RefreshCw, Activity, CheckCircle, XCircle } from "lucide-react";
import { AuditLogItem, ToastMessage } from "./SettingsTypes";
import { SettingsToast } from "./SettingsToast";

interface AuditTabProps {
  activeTab: string;
  showToast: (text: string, type?: "success" | "error") => void;
  toastMessage: ToastMessage | null;
  setToastMessage: (msg: ToastMessage | null) => void;
}

export function AuditTab({ activeTab, showToast, toastMessage, setToastMessage }: AuditTabProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

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

  if (activeTab !== "audit") return null;

  return (
    <>
      <SettingsToast message={toastMessage} onClose={() => setToastMessage(null)} />
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
    </>
  );
}
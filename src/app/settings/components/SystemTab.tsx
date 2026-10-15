"use client";

import { useState } from "react";
import { RefreshCw, GitBranch, HardDrive, Sparkles, Download, Activity } from "lucide-react";
import { SystemData, ToastMessage } from "./SettingsTypes";
import { SettingsToast } from "./SettingsToast";

interface SystemTabProps {
  activeTab: string;
  showToast: (text: string, type?: "success" | "error") => void;
  toastMessage: ToastMessage | null;
  setToastMessage: (msg: ToastMessage | null) => void;
}

export function SystemTab({ activeTab, showToast, toastMessage, setToastMessage }: SystemTabProps) {
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadSystem = async () => {
    try {
      setLoadingSystem(true);
      const res = await fetch("/api/admin/system", { method: "GET" });
      const data = await res.json();
      if (data.ok) setSystemData(data.system);
    } catch {
      showToast("Falha ao obter status do sistema", "error");
    } finally {
      setLoadingSystem(false);
    }
  };

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

  if (activeTab !== "system") return null;

  return (
    <>
      <SettingsToast message={toastMessage} onClose={() => setToastMessage(null)} />
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
                Exporte o banco de dados <code className="font-mono text-xs bg-surface-2 px-1 rounded">icewall.db</code> completo contendo métricas, histórico de benchmarks, delegações e credenciais.
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
    </>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Server,
  Plus,
  Terminal,
  Activity,
  Cpu,
  Layers,
  ArrowRight,
  LogOut,
  RefreshCw,
  HardDrive,
  Settings,
  Key,
  Trash2,
  Edit3,
} from "lucide-react";
import { useServer } from "@/components/server-context";

interface Cluster {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  status: string;
  gpuModel?: string;
  totalMemoryGb?: number;
  activeModelsCount?: number;
}

interface TrainServer {
  id: number;
  nome: string;
  tipo: "spark" | "generic";
  host: string;
  porta: number;
  usuario: string;
  criadoEm: number;
  atualizadoEm: number;
}

export default function ClustersPage() {
  const router = useRouter();
  const { setActiveServer } = useServer();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEndpoint, setNewEndpoint] = useState("http://10.0.5.18:11434");
  const [newSshHost, setNewSshHost] = useState("10.0.5.18");
  const [newSshUser, setNewSshUser] = useState("facini");
  const [newType, setNewType] = useState("dgx-spark");

  // ── Train Servers ───────────────────────────────────────────────────────
  const [trainServers, setTrainServers] = useState<TrainServer[]>([]);
  const [loadingTrains, setLoadingTrains] = useState(true);
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [trainNome, setTrainNome] = useState("");
  const [trainTipo, setTrainTipo] = useState<"spark" | "generic">("spark");
  const [trainHost, setTrainHost] = useState("");
  const [trainPorta, setTrainPorta] = useState(22);
  const [trainUsuario, setTrainUsuario] = useState("");
  const [trainKeyPath, setTrainKeyPath] = useState("/home/facini/.ssh/id_ed25519");

  const loadClusters = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/clusters");
      const data = await res.json();
      if (data.ok) {
        setClusters(data.clusters);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTrainServers = async () => {
    try {
      setLoadingTrains(true);
      const res = await fetch("/api/train/servers");
      const data = await res.json();
      if (data.ok) setTrainServers(data.servers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTrains(false);
    }
  };

  const openAddServerModal = () => {
    setEditingServerId(null);
    setTrainNome("");
    setTrainTipo("spark");
    setTrainHost("");
    setTrainPorta(22);
    setTrainUsuario("");
    setTrainKeyPath("/home/facini/.ssh/id_ed25519");
    setShowAddServerModal(true);
  };

  const openEditServerModal = (server: TrainServer) => {
    setEditingServerId(server.id);
    setTrainNome(server.nome);
    setTrainTipo(server.tipo);
    setTrainHost(server.host);
    setTrainPorta(server.porta);
    setTrainUsuario(server.usuario);
    setTrainKeyPath("[ocultado por segurança]");
    setShowAddServerModal(true);
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainNome || !trainHost || !trainUsuario) return;

    try {
      const res = await fetch("/api/train/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: trainNome,
          tipo: trainTipo,
          host: trainHost,
          porta: trainPorta,
          usuario: trainUsuario,
          chaveSshPath: trainKeyPath.replace("[ocultado por segurança]", ""),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddServerModal(false);
        loadTrainServers();
      } else if (data.error === "nome_duplicado") {
        alert(data.message);
      } else {
        alert(`Erro: ${data.error || "Desconhecido"}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServerId || !trainNome || !trainHost || !trainUsuario) return;

    try {
      const res = await fetch(`/api/train/servers?id=${editingServerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: trainNome,
          tipo: trainTipo,
          host: trainHost,
          porta: trainPorta,
          usuario: trainUsuario,
          chaveSshPath: trainKeyPath.replace("[ocultado por segurança]", "") || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddServerModal(false);
        loadTrainServers();
      } else {
        alert(`Erro: ${data.error || "Desconhecido"}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteServer = async (id: number, nome: string) => {
    if (!confirm(`Remover servidor "${nome}"?`)) return;
    try {
      const res = await fetch(`/api/train/servers?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) loadTrainServers();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadClusters();
    loadTrainServers();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const handleAddCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    try {
      const res = await fetch("/api/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          type: newType,
          endpoint: newEndpoint,
          sshHost: newSshHost,
          sshUser: newSshUser,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddModal(false);
        setNewName("");
        loadClusters();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-5 border-b border-line">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-ink tracking-tight">Meus Servidores e Clusters</h1>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ice/10 text-ice border border-ice/20">
              SaaS Multi-Cluster
            </span>
          </div>
          <p className="text-xs text-ink-3">
            Ambientes de IA e servidores bare-metal conectados e orquestrados pelo ICEWALL JEV.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => loadClusters()}
            className="p-2 text-ink-3 hover:text-ink rounded-lg bg-surface-2/60 hover:bg-surface-2 border border-line transition-colors cursor-pointer"
            title="Atualizar lista de servidores"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push("/terminal")}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 hover:bg-surface-2/80 text-xs font-medium rounded-lg text-ink border border-line transition-colors cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Terminal Ao Vivo</span>
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 hover:bg-surface-2/80 text-xs font-medium rounded-lg text-ink border border-line transition-colors cursor-pointer"
            title="Configurações e Administração do ICEWALL"
          >
            <Settings className="w-3.5 h-3.5 text-indigo-400" />
            <span>Configurações</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-ice hover:bg-ice/90 text-white text-xs font-medium rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Servidor</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium rounded-lg text-rose-300 border border-rose-500/20 transition-colors cursor-pointer"
            title="Desconectar do ICEWALL"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-ink-3">
            <RefreshCw className="w-5 h-5 animate-spin text-ice mr-2" />
            <span>Carregando servidores...</span>
          </div>
        ) : clusters.length === 0 ? (
          <div className="border border-dashed border-line rounded-2xl p-12 text-center bg-surface-2/30">
            <Server className="w-12 h-12 text-ink-3 mx-auto mb-4" />
            <h3 className="text-sm font-semibold text-ink">Nenhum servidor conectado</h3>
            <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
              Adicione seu primeiro servidor NVIDIA Spark, workstation local ou nó de nuvem para começar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {clusters.map((cluster) => (
              <div
                key={cluster.id}
                className="bg-surface border border-line rounded-xl p-5 hover:border-ice/40 transition-all flex flex-col justify-between group shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-ice/10 border border-ice/20 flex items-center justify-center text-ice group-hover:scale-105 transition-transform">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-ink text-sm leading-snug">{cluster.name}</h3>
                        <span className="text-[11px] font-mono text-ink-3">{cluster.sshHost || cluster.endpoint}</span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Online
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-4 pt-3 border-t border-line-soft text-xs">
                    <div className="flex items-center gap-2 text-ink-2">
                      <Cpu className="w-3.5 h-3.5 text-ice" />
                      <span className="truncate">{cluster.gpuModel || "Blackwell Spark"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-2">
                      <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{cluster.totalMemoryGb || 128} GB RAM Unif.</span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-2">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>{cluster.activeModelsCount || 5} Modelos Ollama</span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-2">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span>JEV Ativo</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-line-soft">
                  <button
                    onClick={() => {
                      setActiveServer({
                        id: cluster.id,
                        name: cluster.name,
                        type: cluster.type,
                        endpoint: cluster.endpoint,
                        sshHost: cluster.sshHost,
                        sshPort: cluster.sshPort,
                        sshUser: cluster.sshUser,
                        status: cluster.status,
                      });
                      router.push(`/?cluster=${cluster.id}`);
                    }}
                    className="flex-1 py-2 px-3 bg-surface-2 hover:bg-ice/15 hover:text-ice text-ink border border-line-soft rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>Abrir Painel</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      setActiveServer({
                        id: cluster.id,
                        name: cluster.name,
                        type: cluster.type,
                        endpoint: cluster.endpoint,
                        sshHost: cluster.sshHost,
                        sshPort: cluster.sshPort,
                        sshUser: cluster.sshUser,
                        status: cluster.status,
                      });
                      router.push(`/terminal?target=remote&host=${cluster.sshHost || "10.0.5.18"}&user=${cluster.sshUser || "facini"}`);
                    }}
                    className="py-2 px-3 bg-surface-2 hover:bg-surface-2/80 text-ink-2 border border-line-soft rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    title="Acessar Shell do Servidor"
                  >
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Seção: Servidores de Treinamento ─────────────────────────── */}
      <div className="mt-14">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-ink tracking-tight">Servidores de Treinamento</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Gerencie os servidores remotos usados para job de fine-tune e ingestão de datasets.
            </p>
          </div>
          <button
            onClick={openAddServerModal}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-xs font-medium rounded-lg border border-cyan-500/20 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Servidor</span>
          </button>
        </div>

        {loadingTrains ? (
          <div className="flex items-center justify-center py-12 text-ink-3">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            <span>Carregando servidores...</span>
          </div>
        ) : trainServers.length === 0 ? (
          <div className="border border-dashed border-line rounded-2xl p-10 text-center bg-surface-2/30">
            <Key className="w-10 h-10 text-ink-3 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-ink">Nenhum servidor de treinamento cadastrado</h3>
            <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
              Adicione servidores remotos para executar fine-tunes e ingestão de datasets.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">Nome</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">Host:Porta</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">Usuário</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">Chave SSH</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {trainServers.map((srv) => (
                    <tr key={srv.id} className="border-b border-line-soft last:border-b-0 hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink">{srv.nome}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          srv.tipo === "spark"
                            ? "bg-violet-500/10 text-violet-300 border border-violet-500/20"
                            : "bg-slate-500/10 text-slate-300 border border-slate-500/20"
                        }`}>
                          {srv.tipo === "spark" ? "✨ Spark GPU" : "🖥 Genérico"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-2 font-mono text-xs">{srv.host}:{srv.porta}</td>
                      <td className="px-4 py-3 text-ink-2 font-mono text-xs">@{srv.usuario}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-mono text-ink-3 truncate max-w-[160px] block" title={srv.id === editingServerId ? "[ocultado]" : "[caminho da chave SSH]"}>
                          {srv.id === editingServerId ? "••••••••" : "/home/.../id_*"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditServerModal(srv)}
                            className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-2/80 border border-line-soft text-ink-3 hover:text-ice transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteServer(srv.id, srv.nome)}
                            className="p-1.5 rounded-md bg-surface-2 hover:bg-rose-500/20 border border-line-soft text-ink-3 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Remover servidor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              {trainServers.length} servidor{trainServers.length !== 1 ? "es" : ""} cadastrado{trainServers.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>

      {/* Modal Adicionar Servidor */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Adicionar Novo Servidor</h2>
            <p className="text-xs text-slate-400 mb-4">Conecte um nó Spark ou servidor remoto ao cluster ICEWALL.</p>

            <form onSubmit={handleAddCluster} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Nome do Servidor</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ex: NVIDIA Spark Lab 02"
                  required
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Tipo de Ambiente</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="dgx-spark">DGX Spark (NVIDIA Blackwell)</option>
                  <option value="cloud-gpu">Cloud GPU (RunPod, Lambda, AWS)</option>
                  <option value="local-pc">Workstation / Desktop Local</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Endpoint Ollama / vLLM</label>
                <input
                  type="text"
                  value={newEndpoint}
                  onChange={(e) => setNewEndpoint(e.target.value)}
                  placeholder="http://10.0.5.8:11434"
                  required
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">IP para Shell / SSH</label>
                <input
                  type="text"
                  value={newSshHost}
                  onChange={(e) => setNewSshHost(e.target.value)}
                  placeholder="10.0.5.18"
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Usuário SSH</label>
                <input
                  type="text"
                  value={newSshUser}
                  onChange={(e) => setNewSshUser(e.target.value)}
                  placeholder="facini"
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
                >
                  Cadastrar Servidor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar/Editar Servidor de Treinamento */}
      {showAddServerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">
              {editingServerId ? "Editar Servidor" : "Novo Servidor de Treinamento"}
            </h2>
            <p className="text-xs text-slate-400 mb-4">Conecte um nó remoto para fine-tune e datasets.</p>

            <form onSubmit={editingServerId ? handleUpdateServer : handleAddServer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Nome</label>
                <input
                  type="text"
                  value={trainNome}
                  onChange={(e) => setTrainNome(e.target.value)}
                  placeholder="ex: Spark GPU 01"
                  required
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Tipo</label>
                <select
                  value={trainTipo}
                  onChange={(e) => setTrainTipo(e.target.value as "spark" | "generic")}
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="spark">Spark GPU (NVIDIA Blackwell)</option>
                  <option value="generic">Genérico</option>
                </select>
              </div>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Host</label>
                  <input
                    type="text"
                    value={trainHost}
                    onChange={(e) => setTrainHost(e.target.value)}
                    placeholder="10.0.5.8"
                    required
                    className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Porta</label>
                  <input
                    type="number"
                    value={trainPorta}
                    onChange={(e) => setTrainPorta(Number(e.target.value))}
                    min={1}
                    max={65535}
                    required
                    className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Usuário SSH</label>
                <input
                  type="text"
                  value={trainUsuario}
                  onChange={(e) => setTrainUsuario(e.target.value)}
                  placeholder="facini"
                  required
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setShowAddServerModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  {editingServerId ? "Salvar Alterações" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

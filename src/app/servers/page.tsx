"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Box,
  ChevronRight,
  Cpu,
  Edit3,
  HardDrive,
  Key,
  Layers,
  LogOut,
  Plus,
  RefreshCw,
  Server as ServerIcon,
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";
import type { serverMonitor } from "@/server/queries";
import { useAction, useLive } from "@/lib/api";
import { ago, bytes, num, stateLabel } from "@/lib/format";
import { useServer } from "@/components/server-context";
import {
  ActionButton,
  Button,
  Code,
  Empty,
  ErrorNote,
  Loading,
  PageHeader,
  Panel,
  Status,
  Table,
  type Level,
} from "@/components/ui";

type Monitor = ReturnType<typeof serverMonitor>;
type ServerEntry = Monitor[number];

/** Espelho do SafeServer devolvido pela API (nunca inclui chaveSshPath/vllmKey). */
interface TrainServer {
  id: number;
  nome: string;
  tipo: "local" | "ssh";
  host: string;
  porta: number | null;
  usuario: string | null;
  vllmUrl: string | null;
  capacidades: Record<string, boolean> | null;
  ultimoStatus: string | null;
  ultimoCheck: number | null;
  criadoEm: number;
  atualizadoEm: number;
}

/** Estado geral do card: usa os erros dos snapshots, não um "online" fictício. */
function cardStatus(entry: ServerEntry): { level: Level; label: string } {
  const snaps = [entry.health, entry.docker, entry.ollama, entry.vllm];
  if (snaps.every((s) => s === null)) return { level: "info", label: "aguardando coleta" };
  const errors = snaps.filter((s) => s?.error).length;
  if (entry.health?.error && entry.docker?.error && errors === snaps.filter(Boolean).length) {
    return { level: "critical", label: "inacessível" };
  }
  if (errors > 0) return { level: "warning", label: "coleta parcial" };
  return { level: "good", label: "online" };
}

function tipoLabel(tipo: "local" | "ssh"): string {
  return tipo === "local" ? "📍 Local" : "🌐 SSH";
}

function ServerCard({ entry }: { entry: ServerEntry }) {
  const router = useRouter();
  const logs = useAction();
  const { setActiveServer } = useServer();
  const [logsOf, setLogsOf] = useState<string | null>(null);
  const { server } = entry;
  const h = entry.health?.data;
  const d = entry.docker?.data;
  const ollama = entry.ollama;
  const vllm = entry.vllm;
  const os = entry.os?.data;
  const status = cardStatus(entry);
  const running = (d?.containers ?? []).filter((c) => c.state === "running").length;

  /** Liga este servidor do registro à sidebar (o mesmo formato do contexto). */
  const selecionar = () => {
    setActiveServer({
      id: String(server.id),
      name: server.nome,
      type: server.tipo,
      endpoint: server.tipo === "ssh" ? `ssh://${server.usuario ?? ""}@${server.host}:${server.porta ?? 22}` : "localhost",
      sshHost: server.tipo === "ssh" ? server.host : undefined,
      sshPort: server.tipo === "ssh" ? server.porta ?? undefined : undefined,
      sshUser: server.usuario ?? undefined,
      status: status.label,
    });
    router.push("/");
  };

  return (
    <Panel
      className="min-w-0"
      title={
        <span className="flex items-center gap-2">
          <ServerIcon size={15} className="text-ice" aria-hidden />
          {server.nome}
          <span className="text-[11px] font-normal text-ink-3">
            {tipoLabel(server.tipo)} · {server.tipo === "ssh" ? `${server.host}:${server.porta ?? 22}` : "esta máquina"}
          </span>
        </span>
      }
      aside={<Status level={status.level} label={status.label} />}
    >
      {/* Saúde (GPU, memória, CPU, disco) */}
      {entry.health?.error && <ErrorNote>Saúde: {entry.health.error}</ErrorNote>}
      {h ? (
        <div className="grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <div className="flex items-center gap-2 text-ink-2">
            <Cpu size={14} className="shrink-0 text-ice" aria-hidden />
            <span>
              {h.gpu ? (
                <>
                  GPU {h.gpu.util != null ? `${num(h.gpu.util)}%` : "—"} · {h.gpu.temp != null ? `${num(h.gpu.temp)}°C` : "—"}
                </>
              ) : (
                "sem GPU detectada"
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-ink-2">
            <HardDrive size={14} className="shrink-0 text-indigo-400" aria-hidden />
            <span>
              RAM {bytes(h.memTotal - h.memAvailable)} / {bytes(h.memTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-ink-2">
            <Activity size={14} className="shrink-0 text-emerald-400" aria-hidden />
            <span>
              Carga {num(h.load1, 1)} · {h.cpuCount} CPUs
            </span>
          </div>
          <div className="flex items-center gap-2 text-ink-2">
            <Layers size={14} className="shrink-0 text-amber-400" aria-hidden />
            <span>
              Disco {h.diskUsed != null && h.diskTotal != null ? `${bytes(h.diskUsed)} / ${bytes(h.diskTotal)}` : "—"}
            </span>
          </div>
        </div>
      ) : (
        !entry.health?.error && <Empty>Ainda sem coleta de saúde deste servidor.</Empty>
      )}

      {/* Containers com ações deste servidor */}
      <div className="mt-4 border-t border-line-soft pt-3">
        <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-ink-3">
          <span className="flex items-center gap-1.5">
            <Box size={13} aria-hidden /> Containers ({running}/{d?.containers?.length ?? 0} ativos)
            {entry.docker && <span className="font-normal">· {ago(entry.docker.ts)}</span>}
          </span>
        </div>
        {entry.docker?.error && <ErrorNote>{entry.docker.error}</ErrorNote>}
        {!entry.docker?.error &&
          (d?.containers?.length ? (
            <Table head={["Nome", "Estado", ""]} dense>
              {d.containers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[12px] text-ink-3">{c.gpu ? "usa GPU · " : ""}{c.image}</div>
                  </td>
                  <td>
                    <Status level={c.state === "running" ? "good" : c.status.includes("(137)") ? "warning" : "info"} label={stateLabel(c.state)} />
                    <div className="text-[12px] text-ink-3">{c.status}</div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {c.state === "running" ? (
                        <>
                          <ActionButton action="container.restart" target={c.name} serverId={server.id} label="Reiniciar" />
                          <ActionButton action="container.stop" target={c.name} serverId={server.id} label="Parar" danger />
                        </>
                      ) : (
                        <ActionButton action="container.start" target={c.name} serverId={server.id} label="Iniciar" />
                      )}
                      <Button
                        onClick={() => {
                          setLogsOf(c.name);
                          logs.mutate({ action: "container.logs", target: c.name, serverId: server.id });
                        }}
                      >
                        Logs
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nenhum container.</Empty>
          ))}
        {logsOf && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[12px] text-ink-3">
              <span>Logs: {logsOf}</span>
              <button className="hover:text-ink" onClick={() => setLogsOf(null)}>fechar</button>
            </div>
            {logs.isPending ? (
              <Loading label="Lendo logs" />
            ) : logs.data && !logs.data.ok ? (
              <ErrorNote>{logs.data.output}</ErrorNote>
            ) : (
              <Code>{logs.data?.output || "(vazio)"}</Code>
            )}
          </div>
        )}
      </div>

      {/* Ollama (capacidade opcional) */}
      <div className="mt-4 border-t border-line-soft pt-3 text-[12.5px]">
        <div className="mb-2 text-[12px] font-semibold text-ink-3">Ollama</div>
        {ollama?.error ? (
          <ErrorNote>{ollama.error}</ErrorNote>
        ) : ollama?.data ? (
          ollama.data.status === "online" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Status level="good" label={`online · ${ollama.data.models.length} modelos · ${ollama.data.loaded.length} carregados`} />
              {ollama.data.loaded.length > 0 && (
                <span className="text-ink-2">
                  {ollama.data.loaded.map((m) => m.name).join(", ")}
                </span>
              )}
            </div>
          ) : (
            <Status level="info" label={`offline (${ollama.data.reason ?? "serviço inativo"})`} />
          )
        ) : (
          <span className="text-ink-3">aguardando coleta…</span>
        )}
      </div>

      {/* vLLM (capacidade opcional) */}
      <div className="mt-4 border-t border-line-soft pt-3 text-[12.5px]">
        <div className="mb-2 text-[12px] font-semibold text-ink-3">vLLM</div>
        {!server.vllmUrl ? (
          <span className="text-ink-3">não configurado neste servidor</span>
        ) : vllm?.error ? (
          <ErrorNote>{vllm.error}</ErrorNote>
        ) : vllm?.data ? (
          <div className="space-y-1.5">
            {vllm.data.status === "online" && <Status level="good" label={`online · ${vllm.data.models.length} modelos`} />}
            {vllm.data.status === "auth" && <Status level="warning" label={vllm.data.reason ?? "autenticação pendente"} />}
            {vllm.data.status === "offline" && <Status level="info" label={`offline (${vllm.data.reason ?? "serviço inativo"})`} />}
            {vllm.data.models.length > 0 && (
              <ul className="space-y-0.5">
                {vllm.data.models.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-ink-2">{m.id}</span>
                    {m.isImage && (
                      <span className="rounded-md border border-aurora-dim/60 bg-aurora/10 px-1.5 py-0.5 text-[10.5px] font-medium text-aurora">
                        imagem
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {vllm.data.status === "online" && Object.keys(vllm.data.metrics).length > 0 && (
              <details className="text-[12px] text-ink-3">
                <summary className="cursor-pointer hover:text-ink">métricas ({Object.keys(vllm.data.metrics).length})</summary>
                <ul className="mt-1 space-y-0.5 font-mono">
                  {Object.entries(vllm.data.metrics).slice(0, 12).map(([k, v]) => (
                    <li key={k} className="truncate" title={k}>
                      {k} = {num(v, 2)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <span className="text-ink-3">aguardando coleta…</span>
        )}
      </div>

      {/* SO */}
      {os && (
        <div className="mt-4 border-t border-line-soft pt-3 text-[12px] text-ink-3">
          {os.prettyName ?? "SO desconhecido"}
          {os.kernel ? ` · kernel ${os.kernel}` : ""}
          {os.gpuName ? ` · ${os.gpuName}` : ""}
        </div>
      )}

      {/* Rodapé: seleção e terminal no servidor */}
      <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
        <Button tone="primary" onClick={selecionar}>
          <ChevronRight size={13} aria-hidden /> Selecionar servidor
        </Button>
        <Button onClick={() => router.push(`/terminal?serverId=${server.id}`)}>
          <Terminal size={13} className="text-emerald-400" aria-hidden /> Terminal neste servidor
        </Button>
      </div>
    </Panel>
  );
}

export default function ServersPage() {
  const router = useRouter();
  const monitor = useLive<Monitor>("/api/servers/monitor", 10_000);

  // ── Registro (CRUD) ────────────────────────────────────────────────────
  const registry = useLive<{ ok: boolean; servers: TrainServer[] }>("/api/train/servers", 30_000);
  const trainServers = registry.data?.servers ?? [];
  const loadingTrains = registry.isLoading;
  const loadTrainServers = () => registry.refetch();
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [trainNome, setTrainNome] = useState("");
  const [trainTipo, setTrainTipo] = useState<"local" | "ssh">("ssh");
  const [trainHost, setTrainHost] = useState("");
  const [trainPorta, setTrainPorta] = useState(22);
  const [trainUsuario, setTrainUsuario] = useState("");
  const [trainKeyPath, setTrainKeyPath] = useState("");
  const [trainVllmUrl, setTrainVllmUrl] = useState("");

  const openAddServerModal = () => {
    setEditingServerId(null);
    setTrainNome("");
    setTrainTipo("ssh");
    setTrainHost("");
    setTrainPorta(22);
    setTrainUsuario("");
    setTrainKeyPath("");
    setTrainVllmUrl("");
    setShowAddServerModal(true);
  };

  const openEditServerModal = (server: TrainServer) => {
    setEditingServerId(server.id);
    setTrainNome(server.nome);
    setTrainTipo(server.tipo);
    setTrainHost(server.host);
    setTrainPorta(server.porta ?? 22);
    setTrainUsuario(server.usuario ?? "");
    // chaveSshPath/vllmKey nunca vêm da API — vazio significa "manter o atual".
    setTrainKeyPath("");
    setTrainVllmUrl(server.vllmUrl ?? "");
    setShowAddServerModal(true);
  };

  const validationMessage = (data: { details?: Record<string, string[]> }): string => {
    const msg = Object.values(data.details ?? {}).flatMap((v) => v).join("\n");
    return `Validação: ${msg || "verifique os campos"}`;
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainNome) return;
    if (trainTipo === "ssh" && (!trainHost || !trainUsuario || !trainKeyPath)) return;

    try {
      const res = await fetch("/api/train/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-icewall": "1" },
        body: JSON.stringify({
          nome: trainNome,
          tipo: trainTipo,
          ...(trainTipo === "ssh"
            ? { host: trainHost, porta: trainPorta, usuario: trainUsuario, chaveSshPath: trainKeyPath }
            : {}),
          vllmUrl: trainVllmUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddServerModal(false);
        loadTrainServers();
      } else if (data.error === "nome_duplicado") {
        alert(data.message);
      } else if (data.error === "validacao_erro") {
        alert(validationMessage(data));
      } else {
        alert(`Erro: ${data.error || "Desconhecido"}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServerId || !trainNome) return;
    if (trainTipo === "ssh" && (!trainHost || !trainUsuario)) return;

    try {
      const res = await fetch(`/api/train/servers/${editingServerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-icewall": "1" },
        body: JSON.stringify({
          nome: trainNome,
          tipo: trainTipo,
          host: trainTipo === "ssh" ? trainHost : undefined,
          porta: trainTipo === "ssh" ? trainPorta : undefined,
          usuario: trainTipo === "ssh" ? trainUsuario : undefined,
          // Chave vazia = manter a armazenada (a API não a expõe em GET).
          chaveSshPath: trainKeyPath || undefined,
          vllmUrl: trainVllmUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddServerModal(false);
        loadTrainServers();
      } else if (data.error === "campos_ssh_incompletos") {
        alert(data.message);
      } else if (data.error === "validacao_erro") {
        alert(validationMessage(data));
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
      const res = await fetch(`/api/train/servers/${id}`, {
        method: "DELETE",
        headers: { "x-icewall": "1" },
      });
      const data = await res.json();
      if (data.ok) loadTrainServers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Monitor de Servidores"
        sub="Monitor real multi-servidor: saúde (GPU, memória, CPU), containers, Ollama e vLLM por servidor — coletado pelo scheduler a cada poucos segundos."
        right={
          <div className="flex items-center flex-wrap gap-2.5">
            <Button onClick={() => monitor.refetch()}>
              <RefreshCw size={13} aria-hidden /> Atualizar
            </Button>
            <Button onClick={() => router.push("/terminal")}>
              <Terminal size={13} className="text-emerald-400" aria-hidden /> Terminal Ao Vivo
            </Button>
            <Button onClick={() => router.push("/settings")}>
              <Settings size={13} className="text-indigo-400" aria-hidden /> Configurações
            </Button>
            <Button tone="primary" onClick={openAddServerModal}>
              <Plus size={13} aria-hidden /> Novo Servidor
            </Button>
            <Button tone="danger" onClick={handleLogout}>
              <LogOut size={13} aria-hidden /> Sair
            </Button>
          </div>
        }
      />

      {/* ── Monitor real por servidor (Station e Spark em paralelo) ─────── */}
      {monitor.isLoading ? (
        <Loading label="Carregando monitor" />
      ) : monitor.error || !monitor.data ? (
        <ErrorNote>{String(monitor.error?.message ?? "falha ao carregar o monitor")}</ErrorNote>
      ) : monitor.data.length === 0 ? (
        <Panel title="Nenhum servidor cadastrado">
          <Empty>
            Cadastre a Station (local) e o Spark (SSH) no registro abaixo para começar o monitoramento.
          </Empty>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {monitor.data.map((entry) => (
            <ServerCard key={entry.server.id} entry={entry} />
          ))}
        </div>
      )}

      {/* ── Seção: Registro de Servidores (CRUD) ────────────────────────── */}
      <div className="mt-14">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-ink tracking-tight">Registro de Servidores</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Servidores locais e remotos do cluster — base central de treino, inferência e automação.
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
            <h3 className="text-sm font-semibold text-ink">Nenhum servidor cadastrado</h3>
            <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
              Adicione sua estação local ou servidores remotos para treino, inferência e automação.
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
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">vLLM</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-ink-3 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {trainServers.map((srv) => (
                    <tr key={srv.id} className="border-b border-line-soft last:border-b-0 hover:bg-surface-2/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink">{srv.nome}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          srv.tipo === "local"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-violet-500/10 text-violet-300 border border-violet-500/20"
                        }`}>
                          {srv.tipo === "local" ? "📍 Local" : "🌐 SSH"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-2 font-mono text-xs">{srv.porta ? `${srv.host}:${srv.porta}` : srv.host}</td>
                      <td className="px-4 py-3 text-ink-2 font-mono text-xs">{srv.usuario ? `@${srv.usuario}` : "—"}</td>
                      <td className="px-4 py-3 text-ink-2 font-mono text-xs">
                        <span className="truncate max-w-[180px] block" title={srv.vllmUrl ?? undefined}>
                          {srv.vllmUrl ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => router.push(`/terminal?serverId=${srv.id}`)}
                            className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-2/80 border border-line-soft text-ink-3 hover:text-emerald-400 transition-colors cursor-pointer"
                            title="Terminal neste servidor"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>
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

      {/* Modal Adicionar/Editar Servidor */}
      {showAddServerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">
              {editingServerId ? "Editar Servidor" : "Novo Servidor"}
            </h2>
            <p className="text-xs text-slate-400 mb-4">Adicione uma estação local ou um servidor remoto ao registro do cluster.</p>

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
                  onChange={(e) => setTrainTipo(e.target.value as "local" | "ssh")}
                  className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="ssh">Remoto via SSH</option>
                  <option value="local">Local (esta máquina)</option>
                </select>
              </div>

              {trainTipo === "ssh" && (
                <>
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

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Chave SSH (caminho)</label>
                    <input
                      type="text"
                      value={trainKeyPath}
                      onChange={(e) => setTrainKeyPath(e.target.value)}
                      placeholder="~/.ssh/id_ed25519"
                      required={!editingServerId}
                      className="w-full px-3 py-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                    {editingServerId && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Deixe em branco para manter a chave atual (não exibida por segurança).
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Endpoint vLLM (opcional)</label>
                <input
                  type="text"
                  value={trainVllmUrl}
                  onChange={(e) => setTrainVllmUrl(e.target.value)}
                  placeholder="http://10.0.5.18:8001"
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

"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Send, ShieldAlert, Cpu, Monitor, Server as ServerIcon } from "lucide-react";

interface HistoryEntry {
  command: string;
  output: string;
  isError?: boolean;
}

/** Espelho do SafeServer devolvido por /api/train/servers (sem chaves). */
interface RegistryServer {
  id: number;
  nome: string;
  tipo: "local" | "ssh";
  host: string;
  porta: number | null;
  usuario: string | null;
}

/** Rótulo do prompt: nunca IP/constante fixa — sempre o servidor do registro. */
function serverLabel(srv: RegistryServer): string {
  return srv.tipo === "local" ? `${srv.nome} (local)` : `${srv.usuario}@${srv.host}`;
}

function TerminalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [servers, setServers] = useState<RegistryServer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const paramId = Number(searchParams.get("serverId")) || null;
  const [activeId, setActiveId] = useState<number | null>(paramId);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/train/servers", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (data.ok) {
          const list = data.servers as RegistryServer[];
          setServers(list);
          // Prioridade: ?serverId= → servidor local (Station) → primeiro da lista.
          const initial =
            (paramId && list.find((s) => s.id === paramId)) ||
            list.find((s) => s.tipo === "local") ||
            list[0];
          setActiveId(initial?.id ?? null);
        } else {
          setLoadError(data.error ?? "Falha ao carregar o registro");
        }
      } catch (err) {
        if (alive) setLoadError(err instanceof Error ? err.message : "Falha ao carregar o registro");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = servers?.find((s) => s.id === activeId) ?? null;

  const [inputCommand, setInputCommand] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetedFor = useRef<number | null>(null);

  // Saudação por servidor selecionado (uma vez por servidor).
  useEffect(() => {
    if (!active || greetedFor.current === active.id) return;
    greetedFor.current = active.id;
    setHistory((prev) => [
      ...prev,
      {
        command: "init",
        output: `ICEWALL Shell v2 (multi-servidor)\nAlvo: [${serverLabel(active)}]\nDigite comandos shell (ex: uname -a, uptime, free -h, docker ps, nvidia-smi)...`,
      },
    ]);
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const switchServer = (id: number) => {
    if (id === activeId) return;
    setActiveId(id);
    const srv = servers?.find((s) => s.id === id);
    if (srv) {
      setHistory((prev) => [
        ...prev,
        { command: "switch", output: `=== Alternado para ${serverLabel(srv)} ===` },
      ]);
    }
  };

  const runCommand = async (cmd: string) => {
    if (!cmd.trim() || !active) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/terminal/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd, serverId: active.id }),
        });

        const data = await res.json();
        setHistory((prev) => [
          ...prev,
          {
            command: cmd,
            output: data.output || data.error || "(sem saída)",
            isError: !data.ok,
          },
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Falha na comunicação";
        setHistory((prev) => [
          ...prev,
          { command: cmd, output: `Erro de conexão: ${msg}`, isError: true },
        ]);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCommand.trim() || isPending) return;
    const cmd = inputCommand;
    setInputCommand("");
    runCommand(cmd);
  };

  const promptLabel = active
    ? active.tipo === "local"
      ? "localhost:~$"
      : `${active.usuario}@${active.host}:~$`
    : "~$";

  return (
    <div className="min-h-screen bg-[#070a10] text-[#e2e8f0] flex flex-col font-mono">
      {/* Header */}
      <header className="h-14 border-b border-[#1e293b] bg-[#0c1220]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => router.push("/servers")}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Voltar aos Servidores"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Seleção de servidor do registro (um tab por servidor) */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#070a10] border border-[#1e293b] overflow-x-auto">
            {(servers ?? []).map((srv) => {
              const selected = srv.id === activeId;
              return (
                <button
                  key={srv.id}
                  onClick={() => switchServer(srv.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium whitespace-nowrap transition-all cursor-pointer ${
                    selected
                      ? "bg-slate-800 text-white shadow-xs border border-slate-700 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {srv.tipo === "local" ? (
                    <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <ServerIcon className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>{serverLabel(srv)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {active && active.tipo === "ssh" && (
            <button
              onClick={() => runCommand("nvidia-smi")}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium rounded text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            >
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>nvidia-smi</span>
            </button>
          )}
          <button
            onClick={() => runCommand("uptime")}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium rounded text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <span>uptime</span>
          </button>
          <button
            onClick={() => runCommand("docker ps")}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium rounded text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <span>docker ps</span>
          </button>
          <button
            onClick={() => setHistory([])}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Limpar tela"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Terminal Output Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4 max-w-6xl w-full mx-auto text-xs leading-relaxed">
        {servers === null && !loadError && (
          <div className="flex items-center gap-2 text-slate-400 p-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>Carregando o registro de servidores...</span>
          </div>
        )}
        {loadError && (
          <pre className="p-3 rounded-xl whitespace-pre-wrap break-all bg-rose-950/20 text-rose-300 border border-rose-900/40">
            {`Não foi possível carregar o registro de servidores: ${loadError}`}
          </pre>
        )}
        {servers !== null && servers.length === 0 && (
          <pre className="p-3 rounded-xl whitespace-pre-wrap break-all bg-amber-950/20 text-amber-300 border border-amber-900/40">
            {"Nenhum servidor cadastrado no registro — cadastre a Station e o Spark em /servers."}
          </pre>
        )}

        {history.map((entry, idx) => (
          <div key={idx} className="space-y-1">
            {entry.command !== "init" && entry.command !== "switch" && (
              <div className="flex items-center gap-2 text-slate-400">
                <span className={active?.tipo === "ssh" ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"}>
                  {promptLabel}
                </span>
                <span className="text-white font-semibold">{entry.command}</span>
              </div>
            )}
            <pre
              className={`p-3 rounded-xl whitespace-pre-wrap break-all ${
                entry.isError
                  ? "bg-rose-950/20 text-rose-300 border border-rose-900/40"
                  : "bg-[#0b101d] text-slate-300 border border-[#172033]"
              }`}
            >
              {entry.output}
            </pre>
          </div>
        ))}

        {isPending && (
          <div className="flex items-center gap-2 text-slate-400 p-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>Executando em {active ? serverLabel(active) : "..."}...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Command Input Bar */}
      <div className="p-4 bg-[#0c1220] border-t border-[#1e293b] sticky bottom-0">
        <form onSubmit={handleSubmit} className="max-w-6xl mx-auto flex items-center gap-3">
          <div
            className={`flex items-center gap-2 font-bold text-xs select-none ${
              active?.tipo === "ssh" ? "text-emerald-400" : "text-cyan-400"
            }`}
          >
            <span>{promptLabel}</span>
          </div>
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            disabled={isPending || !active}
            placeholder={
              active
                ? `Digite um comando para executar em ${serverLabel(active)}...`
                : "Carregando o registro de servidores..."
            }
            className="flex-1 bg-[#070a10] border border-[#1e293b] focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            autoFocus
          />
          <button
            type="submit"
            disabled={isPending || !inputCommand.trim() || !active}
            className={`p-2.5 disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer shadow-lg ${
              active?.tipo === "ssh"
                ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                : "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20"
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="max-w-6xl mx-auto mt-2 flex items-center justify-between text-[11px] text-slate-500 font-sans">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500/80" />
            <span>
              Alvo:{" "}
              <strong className="text-slate-400 font-mono">
                {active ? serverLabel(active) : "—"}
              </strong>{" "}
              &bull; Resolvido pelo registro (sem IP fixo) &bull; Sessão autenticada
            </span>
          </div>
          <span className="hidden sm:inline">Pressione Enter para enviar</span>
        </div>
      </div>
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070a10] text-slate-500 p-8">Carregando Shell...</div>}>
      <TerminalContent />
    </Suspense>
  );
}

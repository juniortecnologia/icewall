"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Terminal as TerminalIcon, ArrowLeft, RefreshCw, Send, ShieldAlert, Cpu, Monitor, Server as ServerIcon } from "lucide-react";
import { useServer } from "@/components/server-context";

interface HistoryEntry {
  command: string;
  output: string;
  isError?: boolean;
}

type ShellTarget = "local" | "remote";

function TerminalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeServer } = useServer();

  const initialTarget = (searchParams.get("target") as ShellTarget) || (activeServer ? "remote" : "local");
  const [target, setTarget] = useState<ShellTarget>(initialTarget);

  const remoteHost = searchParams.get("host") || activeServer?.sshHost || "10.0.5.18";
  const remoteUser = searchParams.get("user") || activeServer?.sshUser || "facini";
  const remotePort = searchParams.get("port") ? Number(searchParams.get("port")) : (activeServer?.sshPort || 22);

  const [inputCommand, setInputCommand] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      command: "init",
      output: `ICEWALL Unified Shell v1.3\nAmbiente ativo: [${
        target === "remote" ? `Remoto SSH: ${remoteUser}@${remoteHost}` : "Máquina Local (Este Computador)"
      }]\nDigite comandos shell (ex: uname -a, uptime, free -h, docker ps, nvidia-smi)...`,
    },
  ]);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const switchTarget = (newTarget: ShellTarget) => {
    if (newTarget === target) return;
    setTarget(newTarget);
    setHistory((prev) => [
      ...prev,
      {
        command: "switch",
        output: `=== Alternado para ${
          newTarget === "remote"
            ? `Servidor Remoto SSH (${remoteUser}@${remoteHost})`
            : "Máquina Local (Host local do ICEWALL)"
        } ===`,
      },
    ]);
  };

  const runCommand = async (cmd: string) => {
    if (!cmd.trim()) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/terminal/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: cmd,
            target,
            host: remoteHost,
            user: remoteUser,
            port: remotePort,
          }),
        });

        const data = await res.json();
        setHistory((prev) => [
          ...prev,
          {
            command: cmd,
            output: data.output || "(sem saída)",
            isError: !data.ok,
          },
        ]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Falha na comunicação";
        setHistory((prev) => [
          ...prev,
          {
            command: cmd,
            output: `Erro de conexão: ${msg}`,
            isError: true,
          },
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

  const handleQuickCommand = (cmd: string) => {
    runCommand(cmd);
  };

  const promptLabel = target === "remote" ? `${remoteUser}@${remoteHost}:~$` : "localhost:~$";

  return (
    <div className="min-h-screen bg-[#070a10] text-[#e2e8f0] flex flex-col font-mono">
      {/* Header */}
      <header className="h-14 border-b border-[#1e293b] bg-[#0c1220]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/servers")}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Voltar aos Servidores"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Target Switcher Tabs */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#070a10] border border-[#1e293b]">
            <button
              onClick={() => switchTarget("local")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium transition-all cursor-pointer ${
                target === "local"
                  ? "bg-slate-800 text-white shadow-xs border border-slate-700 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span>Meu Computador (Local)</span>
            </button>
            <button
              onClick={() => switchTarget("remote")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium transition-all cursor-pointer ${
                target === "remote"
                  ? "bg-emerald-950/60 text-emerald-300 shadow-xs border border-emerald-800/60 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ServerIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Servidor Remoto ({remoteHost})</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {target === "remote" && (
            <button
              onClick={() => handleQuickCommand("nvidia-smi")}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium rounded text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            >
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>nvidia-smi</span>
            </button>
          )}
          <button
            onClick={() => handleQuickCommand("uptime")}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium rounded text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <span>uptime</span>
          </button>
          <button
            onClick={() => handleQuickCommand(target === "remote" ? "ollama ps" : "ps aux | grep -i icewall")}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium rounded text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <span>{target === "remote" ? "ollama ps" : "status app"}</span>
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
        {history.map((entry, idx) => (
          <div key={idx} className="space-y-1">
            {entry.command !== "init" && entry.command !== "switch" && (
              <div className="flex items-center gap-2 text-slate-400">
                <span className={target === "remote" ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"}>
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
            <span>
              Executando em {target === "remote" ? `remoto (${remoteUser}@${remoteHost})` : "máquina local"}...
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Command Input Bar */}
      <div className="p-4 bg-[#0c1220] border-t border-[#1e293b] sticky bottom-0">
        <form onSubmit={handleSubmit} className="max-w-6xl mx-auto flex items-center gap-3">
          <div
            className={`flex items-center gap-2 font-bold text-xs select-none ${
              target === "remote" ? "text-emerald-400" : "text-cyan-400"
            }`}
          >
            <span>{promptLabel}</span>
          </div>
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            disabled={isPending}
            placeholder={
              target === "remote"
                ? `Digite um comando para executar em ${remoteHost} via SSH...`
                : "Digite um comando para executar no computador local..."
            }
            className="flex-1 bg-[#070a10] border border-[#1e293b] focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            autoFocus
          />
          <button
            type="submit"
            disabled={isPending || !inputCommand.trim()}
            className={`p-2.5 disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer shadow-lg ${
              target === "remote"
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
                {target === "remote" ? `Remoto (${remoteUser}@${remoteHost})` : "Host Local"}
              </strong>{" "}
              &bull; Sessão segura e autenticada
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


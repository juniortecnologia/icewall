"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { formatarDuracao } from "@/lib/hora";
import type { Decisao } from "@/lib/tipos";
import { DetalheAvaliacao } from "./DetalheAvaliacao";
import { COR_ENTRADA, ROTULO_ENTRADA, SemaforoEntrada } from "./Semaforo";

type Estado = { tipo: "parado" } | { tipo: "avaliando" } | { tipo: "pronto"; d: Decisao } | { tipo: "erro" };

function NoClaudeCode({ d }: { d: Decisao }) {
  const s = d.saidaGancho;
  const [frase, texto] =
    s.decision === "block"
      ? ["seria barrado com esta mensagem:", s.reason ?? ""]
      : s.hookSpecificOutput
        ? ["passaria com este aviso ao Claude:", s.hookSpecificOutput.additionalContext]
        : ["passaria em silêncio.", null];
  return (
    <section className="rounded-md border border-borda bg-black/25 p-3">
      <h3 className="text-sm font-semibold">No Claude Code, isto {frase}</h3>
      {texto ? (
        <p className="mt-2 whitespace-pre-wrap font-mono text-sm leading-relaxed text-apagado [overflow-wrap:anywhere]">{texto}</p>
      ) : null}
    </section>
  );
}

function Resultado({ d }: { d: Decisao }) {
  const cor = COR_ENTRADA[d.semaforo];
  const temNota = d.avaliacao === "jev" && d.nota !== null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <SemaforoEntrada semaforo={d.semaforo} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium" style={{ color: cor }}>
            {ROTULO_ENTRADA[d.semaforo]}
          </p>
          {d.duracaoMs ? <p className="text-apagado tabular-nums">Jev {formatarDuracao(d.duracaoMs)}</p> : null}
        </div>
        <span className="flex flex-col items-end">
          <span
            className="font-mono text-3xl font-semibold leading-none tabular-nums"
            style={temNota ? { color: cor, textShadow: `0 0 16px color-mix(in oklab, ${cor} 55%, transparent)` } : { color: "var(--color-apagado)" }}
          >
            {temNota ? d.nota : "—"}
          </span>
          <span className="mt-1 text-xs text-apagado">nota</span>
        </span>
      </div>
      <div className="space-y-3">
        <DetalheAvaliacao dados={d} />
      </div>
      <NoClaudeCode d={d} />
    </div>
  );
}

/** Botão "Testar um prompt" e o painel por cima da tela. Não grava nada. */
export function TestarPrompt() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "parado" });
  const avaliando = estado.tipo === "avaliando";

  async function avaliar(e: FormEvent) {
    e.preventDefault();
    if (avaliando || !texto.trim()) return;
    setEstado({ tipo: "avaliando" });
    try {
      const r = await fetch("/api/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEstado({ tipo: "pronto", d: (await r.json()) as Decisao });
    } catch {
      setEstado({ tipo: "erro" });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="min-h-9 whitespace-nowrap rounded-md border border-info/50 px-3 text-sm font-medium text-info transition-colors hover:bg-info/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      >
        Testar um prompt
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={idTitulo}
        className="m-auto max-h-[90dvh] w-[min(100%-2rem,48rem)] overflow-y-auto rounded-lg border border-borda bg-painel p-0 text-texto backdrop:bg-black/75"
      >
        <form onSubmit={avaliar} className="space-y-4 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={idTitulo} className="text-lg font-semibold">
                Testar um prompt
              </h2>
              <p className="text-sm text-apagado">Avalia como o portão de entrada, sem mandar ao Claude Code e sem gravar.</p>
            </div>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="min-h-9 rounded-md border border-borda px-3 text-sm text-apagado hover:text-texto focus-visible:outline-2 focus-visible:outline-info"
            >
              Fechar
            </button>
          </div>
          <label className="block">
            <span className="sr-only">Prompt</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder="Cole aqui o prompt que você mandaria ao Claude Code"
              className="block w-full resize-y rounded-md border border-borda bg-black/40 p-3 font-mono text-sm leading-relaxed placeholder:text-apagado focus-visible:outline-2 focus-visible:outline-info"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              aria-disabled={avaliando || !texto.trim()}
              className="min-h-10 rounded-md bg-info px-4 text-sm font-semibold text-fundo aria-disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
            >
              {avaliando ? "Avaliando…" : "Avaliar"}
            </button>
            <p role="status" className="text-sm text-apagado">
              {estado.tipo === "erro" ? <span style={{ color: "var(--color-ambar)" }}>Não deu para avaliar agora. O Crivo está ligado?</span> : null}
            </p>
          </div>
          {estado.tipo === "pronto" ? <Resultado d={estado.d} /> : null}
        </form>
      </dialog>
    </>
  );
}

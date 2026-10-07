"use client";

import { useId, useState } from "react";
import { formatarHora } from "@/lib/hora";
import type { Prompt, Tamanho } from "@/lib/tipos";
import { BarraCriterio } from "./BarraCriterio";
import { IconeChevron } from "./icones";
import { COR_ENTRADA, ROTULO_ENTRADA, SemaforoEntrada } from "./Semaforo";

const ROTULO_TAMANHO: Record<Tamanho, string> = {
  ajuste: "ajuste pequeno",
  funcionalidade: "funcionalidade",
  sistema: "sistema inteiro",
};

const AVISO = {
  amarelo: "O Claude vai perguntar antes de começar.",
  vermelho: "Barrado: este prompt não chega ao Claude.",
} as const;

export function ItemPrompt({ prompt, novo }: { prompt: Prompt; novo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const idDetalhe = useId();
  const cor = COR_ENTRADA[prompt.semaforo];
  const c = prompt.criterios;
  const semNota = prompt.nota === null;

  return (
    <li className={`overflow-hidden rounded-md border border-borda bg-painel ${novo ? "animate-entrada" : ""}`}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-painel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-info"
      >
        <SemaforoEntrada semaforo={prompt.semaforo} />
        <span className="min-w-0 flex-1">
          <span
            className={`font-mono text-sm leading-relaxed [overflow-wrap:anywhere] ${aberto ? "block whitespace-pre-wrap" : "line-clamp-2"}`}
          >
            {prompt.texto}
          </span>
          <span className="mt-2 flex items-center gap-3 text-sm">
            <span className="font-medium" style={{ color: cor }}>
              {ROTULO_ENTRADA[prompt.semaforo]}
            </span>
            <time dateTime={prompt.criadoEm} className="text-apagado tabular-nums">
              {formatarHora(prompt.criadoEm)}
            </time>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span
            className="font-mono text-3xl font-semibold leading-none tabular-nums"
            style={
              semNota
                ? { color: "var(--color-apagado)" }
                : { color: cor, textShadow: `0 0 16px color-mix(in oklab, ${cor} 55%, transparent)` }
            }
          >
            {semNota ? "—" : prompt.nota}
          </span>
          <span className="mt-1 text-xs text-apagado">nota</span>
        </span>
        <IconeChevron className={`mt-1 size-4 shrink-0 text-apagado transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      <div id={idDetalhe} hidden={!aberto} className="space-y-3 border-t border-borda bg-black/25 px-3 py-3">
        {prompt.semaforo !== "verde" ? (
          <p className="text-sm" style={{ color: cor }}>
            {AVISO[prompt.semaforo]}
          </p>
        ) : null}
        {c === null ? (
          <p className="text-sm text-apagado">Ainda sem avaliação: a nota chega quando a IA for ligada.</p>
        ) : (
          <>
            <BarraCriterio
              rotulo="Tamanho do pedido"
              pct={c.tamanhoPct}
              detalhe={ROTULO_TAMANHO[c.tamanho]}
              escala
              alerta={c.tamanho === "sistema"}
            />
            <BarraCriterio rotulo="Objetivo claro" pct={c.objetivoPct} />
            <BarraCriterio rotulo="Diz onde mexer" pct={c.ondePct} />
            <BarraCriterio rotulo="Diz quando está pronto" pct={c.prontoPct} />
            <BarraCriterio rotulo="Foco num assunto só" pct={c.focoPct} />
          </>
        )}
      </div>
    </li>
  );
}

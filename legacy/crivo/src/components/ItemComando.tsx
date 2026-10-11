"use client";

import { useState } from "react";
import { formatarHora } from "@/lib/hora";
import type { Comando } from "@/lib/tipos";
import { IconeArquivo, IconeChevron, IconeTerminal } from "./icones";
import { COR_SAIDA, SemaforoSaida } from "./Semaforo";

export function ItemComando({ comando, novo }: { comando: Comando; novo: boolean }) {
  // Comandos reais podem ter centenas de linhas (heredocs): fechado mostra 3, aberto rola sozinho.
  const [aberto, setAberto] = useState(false);
  const segurado = comando.semaforo === "segurado";
  const cor = COR_SAIDA[comando.semaforo];
  const Icone = comando.tipo === "arquivo" ? IconeArquivo : IconeTerminal;

  return (
    <li
      className={`relative overflow-hidden rounded-md border bg-painel ${
        segurado ? "border-vermelho/40" : "border-borda"
      } ${novo ? "animate-entrada" : ""}`}
    >
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-painel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-info"
      >
        <SemaforoSaida semaforo={comando.semaforo} />
        <span className="block min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <Icone className="mt-0.5 size-4 shrink-0 text-apagado" />
            <span className="sr-only">{comando.tipo === "arquivo" ? "Arquivo:" : "Comando:"}</span>
            <code
              className={`min-w-0 font-mono text-sm leading-relaxed [overflow-wrap:anywhere] ${
                aberto ? "block max-h-[60vh] overflow-y-auto whitespace-pre-wrap" : "line-clamp-3"
              }`}
            >
              {comando.tipo === "comando" ? <span className="text-apagado">$ </span> : null}
              {comando.alvo}
            </code>
          </span>
          {comando.regra ? (
            <span className="mt-2 block text-sm text-vermelho">Regra: {comando.regra}</span>
          ) : (
            <span className="mt-2 block text-sm text-apagado">Nenhuma regra tocada</span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-sm">
          <span className="font-medium" style={{ color: cor }}>
            {segurado ? "Segurado" : "Liberado"}
          </span>
          <time dateTime={comando.criadoEm} className="text-apagado tabular-nums">
            {formatarHora(comando.criadoEm)}
          </time>
        </span>
        <IconeChevron className={`mt-1 size-4 shrink-0 text-apagado transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
    </li>
  );
}

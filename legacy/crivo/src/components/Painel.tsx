"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatarHora } from "@/lib/hora";
import type { Conexao, Feed } from "@/lib/tipos";
import { Coluna } from "./Coluna";
import { IconeEntrada, IconeSaida, Logo } from "./icones";
import { ItemComando } from "./ItemComando";
import { ItemPrompt } from "./ItemPrompt";
import { Placar } from "./Placar";
import { Rodape } from "./Rodape";
import { TestarPrompt } from "./TestarPrompt";

const INTERVALO_MS = 1000;
const maiorId = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0);

type Aba = "entrada" | "saida";

const PROJETO = "happy-team-chat";

function SinalProjeto({ conexao }: { conexao: Conexao }) {
  const cor = conexao.conectado ? "var(--color-info)" : "var(--color-apagado)";
  return (
    <div className="text-right text-sm">
      <p className="flex items-center justify-end gap-2 font-medium" style={{ color: cor }}>
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: cor, boxShadow: conexao.conectado ? `0 0 10px ${cor}` : "none" }}
        />
        {conexao.conectado ? `${PROJETO} conectado` : `Esperando o ${PROJETO}`}
      </p>
      {conexao.ultimoSinal ? (
        <p className="text-xs text-apagado tabular-nums">último sinal às {formatarHora(conexao.ultimoSinal)}</p>
      ) : null}
    </div>
  );
}

export function Cabecalho({
  sinal,
  conexao,
  acao,
}: {
  sinal: "ao-vivo" | "sem-sinal" | "carregando";
  conexao?: Conexao;
  acao?: ReactNode;
}) {
  const cor = sinal === "ao-vivo" ? "var(--color-verde)" : sinal === "sem-sinal" ? "var(--color-ambar)" : "var(--color-apagado)";
  const texto = sinal === "ao-vivo" ? "Ao vivo" : sinal === "sem-sinal" ? "Sem sinal" : "Conectando…";
  return (
    <header className="flex items-center gap-3">
      <Logo className="size-10 shrink-0 text-texto" />
      <div className="min-w-0">
        <h1 className="text-3xl font-bold uppercase leading-none tracking-[0.08em] [font-stretch:75%]">Crivo</h1>
        <p className="mt-1 text-sm text-apagado">Os dois portões do Claude Code</p>
      </div>
      <div className="ml-auto flex flex-col items-end gap-1.5">
        {acao}
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${sinal === "ao-vivo" ? "animate-pulso" : ""}`}
            style={{ background: cor, boxShadow: `0 0 10px ${cor}` }}
          />
          <span style={{ color: cor }}>{texto}</span>
        </p>
        {conexao ? <SinalProjeto conexao={conexao} /> : null}
      </div>
    </header>
  );
}

export function Painel({ feedInicial, chaveCarregada }: { feedInicial: Feed; chaveCarregada: boolean }) {
  const [feed, setFeed] = useState(feedInicial);
  const [sinal, setSinal] = useState<"ao-vivo" | "sem-sinal">("ao-vivo");
  const [aba, setAba] = useState<Aba>("entrada");
  // Só os itens que chegaram depois do carregamento ganham o brilho de entrada.
  const [corte] = useState(() => ({ prompt: maiorId(feedInicial.prompts), comando: maiorId(feedInicial.comandos) }));

  // Toda requisição ganha um número; resposta mais velha que a última aplicada é descartada.
  const sequencia = useRef(0);
  const aplicada = useRef(0);

  const aplicar = useCallback((n: number, novo: Feed) => {
    if (n < aplicada.current) return;
    aplicada.current = n;
    setFeed(novo);
  }, []);

  const consultar = useCallback(async () => {
    const n = ++sequencia.current;
    try {
      const r = await fetch("/api/feed", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      aplicar(n, (await r.json()) as Feed);
      setSinal("ao-vivo");
    } catch {
      setSinal("sem-sinal");
    }
  }, [aplicar]);

  useEffect(() => {
    let timer: number | undefined;
    const iniciar = () => {
      if (timer === undefined) timer = window.setInterval(consultar, INTERVALO_MS);
    };
    const parar = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") {
        void consultar();
        iniciar();
      } else {
        parar();
      }
    };
    if (document.visibilityState === "visible") iniciar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [consultar]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-4 p-4 md:h-dvh md:p-6">
      <Cabecalho sinal={sinal} conexao={feed.conexao} acao={<TestarPrompt />} />

      <Placar placar={feed.placar} />

      <div role="tablist" aria-label="Portões" className="grid grid-cols-2 gap-2 md:hidden">
        {(
          [
            ["entrada", "Entrada"],
            ["saida", "Saída"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            aria-controls={`portao-${valor}`}
            onClick={() => setAba(valor)}
            className={`min-h-11 rounded-md border text-base font-semibold ${
              aba === valor ? "border-info bg-info/10 text-texto" : "border-borda text-apagado"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <main className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <Coluna
          id="portao-entrada"
          titulo="Portão de entrada"
          subtitulo="Cada prompt, antes de o Claude ler"
          icone={<IconeEntrada className="size-5" />}
          total={feed.prompts.length}
          oculta={aba !== "entrada"}
          vazio={`Esperando o primeiro prompt do ${PROJETO}. Mande algo para o Claude Code lá.`}
        >
          {feed.prompts.map((p) => (
            <ItemPrompt key={p.id} prompt={p} novo={p.id > corte.prompt} />
          ))}
        </Coluna>
        <Coluna
          id="portao-saida"
          titulo="Portão de saída"
          subtitulo="Cada comando, contra as regras da casa"
          icone={<IconeSaida className="size-5" />}
          total={feed.comandos.length}
          oculta={aba !== "saida"}
          vazio="Nenhum comando ainda. Aparece aqui quando o Claude for rodar um comando ou mexer num arquivo."
        >
          {feed.comandos.map((c) => (
            <ItemComando key={c.id} comando={c} novo={c.id > corte.comando} />
          ))}
        </Coluna>
      </main>

      <Rodape chaveCarregada={chaveCarregada} />
    </div>
  );
}

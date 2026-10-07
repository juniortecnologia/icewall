"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed } from "@/lib/tipos";
import { Coluna } from "./Coluna";
import { IconeEntrada, IconeSaida, Logo } from "./icones";
import { ItemComando } from "./ItemComando";
import { ItemPrompt } from "./ItemPrompt";
import { Placar } from "./Placar";
import { Rodape } from "./Rodape";

const INTERVALO_MS = 2000;
const maiorId = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0);

type Aba = "entrada" | "saida";

export function Cabecalho({ sinal }: { sinal: "ao-vivo" | "sem-sinal" | "carregando" }) {
  const cor = sinal === "ao-vivo" ? "var(--color-verde)" : sinal === "sem-sinal" ? "var(--color-ambar)" : "var(--color-apagado)";
  const texto = sinal === "ao-vivo" ? "Ao vivo" : sinal === "sem-sinal" ? "Sem sinal" : "Conectando…";
  return (
    <header className="flex items-center gap-3">
      <Logo className="size-10 shrink-0 text-texto" />
      <div className="min-w-0">
        <h1 className="text-3xl font-bold uppercase leading-none tracking-[0.08em] [font-stretch:75%]">Crivo</h1>
        <p className="mt-1 text-sm text-apagado">Os dois portões do Claude Code</p>
      </div>
      <p role="status" className="ml-auto flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${sinal === "ao-vivo" ? "animate-pulso" : ""}`}
          style={{ background: cor, boxShadow: `0 0 10px ${cor}` }}
        />
        <span style={{ color: cor }}>{texto}</span>
      </p>
    </header>
  );
}

export function Painel({ feedInicial, chaveCarregada }: { feedInicial: Feed; chaveCarregada: boolean }) {
  const [feed, setFeed] = useState(feedInicial);
  const [sinal, setSinal] = useState<"ao-vivo" | "sem-sinal">("ao-vivo");
  const [aba, setAba] = useState<Aba>("entrada");
  const [simulando, setSimulando] = useState(false);
  const [erroSimular, setErroSimular] = useState<string | null>(null);
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

  async function simular() {
    setSimulando(true);
    setErroSimular(null);
    const n = ++sequencia.current;
    try {
      const r = await fetch("/api/simular", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      aplicar(n, (await r.json()) as Feed);
    } catch {
      setErroSimular("Não deu para simular agora. Tente de novo.");
    } finally {
      setSimulando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-4 p-4 md:h-dvh md:p-6">
      <Cabecalho sinal={sinal} />

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
        >
          {feed.comandos.map((c) => (
            <ItemComando key={c.id} comando={c} novo={c.id > corte.comando} />
          ))}
        </Coluna>
      </main>

      <Rodape chaveCarregada={chaveCarregada} simulando={simulando} erro={erroSimular} onSimular={simular} />
    </div>
  );
}

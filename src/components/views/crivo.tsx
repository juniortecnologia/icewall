"use client";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, Terminal } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { send, useLive } from "@/lib/api";
import { ago, clock } from "@/lib/format";
import { ROTULO_FALTA, mensagemAviso, mensagemBloqueio } from "@/server/crivo/decisao";
import type { Avaliacao, Comando, Decisao, Feed, FonteDescricao, ProjetoCrivo, Prompt, Semaforo, Tamanho } from "@/server/crivo/tipos";
import { Button, Empty, ErrorNote, Loading, Meter, PageHeader, Panel, Readout, Segmented, Status, type Level } from "../ui";

const ENTRADA: Record<Semaforo, { level: Level; label: string }> = {
  verde: { level: "good", label: "passou" },
  amarelo: { level: "warning", label: "perguntar antes" },
  vermelho: { level: "critical", label: "barrado" },
};

const AVALIACAO: Record<Avaliacao, string> = {
  jev: "Jev",
  pressa: "pressa (>>)",
  curta: "resposta curta",
  resposta: "resposta ao Claude",
  notificacao: "notificação do Claude Code",
  falhou: "não avaliado",
};

const FONTE: Record<FonteDescricao, string> = {
  manual: "escrita por você",
  readme: "do README",
  pasta: "só o nome da pasta",
};

const campo = "rounded-md border border-line bg-bg px-2 py-1 text-[12.5px] text-ink outline-none focus-visible:border-ice-dim";

const TAMANHO: Record<Tamanho, string> = { ajuste: "ajuste pequeno", funcionalidade: "funcionalidade", sistema: "sistema inteiro" };

/** Um prompt já gravado ou o resultado da área de teste: o detalhe é o mesmo. */
type Avaliado = Pick<Prompt, "semaforo" | "nota" | "criterios" | "faltando" | "avaliacao" | "motivo" | "duracaoMs" | "tokens">;

function Criterio({ label, pct, faltou }: { label: string; pct: number; faltou: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,13rem)_1fr_3rem] items-center gap-3">
      <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-2">
        {label}
        {faltou && <Status level="warning" label="faltou" />}
      </span>
      <Meter value={pct} max={100} tone="aurora" label={`${label}: ${pct}%`} />
      <span className="tnum text-right text-[12.5px] text-ink-2">{pct}%</span>
    </div>
  );
}

function Recebido({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <figure>
      <figcaption className="text-[12px] text-ink-3">{titulo}</figcaption>
      <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-aurora-dim pl-3 text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
        {children}
      </blockquote>
    </figure>
  );
}

/** O que a Jev disse e o que o Claude Code recebeu. */
function Detalhe({ d }: { d: Avaliado }) {
  if (d.avaliacao === "pressa") return <p className="text-[13px] text-ink-2">Passou direto: começa com &gt;&gt;, a marca de pressa.</p>;
  if (d.avaliacao === "curta") return <p className="text-[13px] text-ink-2">Resposta curta (até 4 palavras): passou sem chamar a Jev.</p>;
  if (d.avaliacao === "resposta") return <p className="text-[13px] text-ink-2">Resposta às perguntas do Claude: passou sem chamar a Jev.</p>;
  if (d.avaliacao === "notificacao")
    return <p className="text-[13px] text-ink-2">Aviso que o próprio Claude Code mandou (comando em segundo plano ou subagente terminou): passou sem chamar a Jev.</p>;
  if (d.avaliacao === "falhou") return <Status level="warning" label={`Não avaliado: ${d.motivo ?? "motivo desconhecido"}. O prompt passou.`} />;
  if (d.avaliacao === null || d.criterios === null) return <p className="text-[13px] text-ink-3">Registrado antes de a Jev avaliar os prompts.</p>;

  const c = d.criterios;
  const faltando = d.faltando ?? [];
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-[12.5px] text-ink-2">
          Tamanho do pedido: <span className="text-ink">{TAMANHO[c.tamanho]}</span>
          {c.tamanho === "ajuste" && <span className="text-ink-3"> (num ajuste só o objetivo conta)</span>}
        </div>
        <Criterio label="Objetivo claro" pct={c.objetivoPct} faltou={faltando.includes("objetivo")} />
        <Criterio label="Diz onde mexer" pct={c.ondePct} faltou={faltando.includes("onde")} />
        <Criterio label="Diz quando está pronto" pct={c.prontoPct} faltou={faltando.includes("pronto")} />
        <Criterio label="Uma tarefa só" pct={c.focoPct} faltou={faltando.includes("mistura")} />
      </div>
      {d.semaforo === "amarelo" && <Recebido titulo="O Claude recebeu junto do prompt">{mensagemAviso(faltando)}</Recebido>}
      {d.semaforo === "vermelho" && d.nota !== null && (
        <Recebido titulo="Barrado. O terminal mostrou">{mensagemBloqueio(d.nota, faltando)}</Recebido>
      )}
      {d.semaforo === "verde" && faltando.length === 0 && <p className="text-[13px] text-ink-3">Nada faltou: o Claude recebeu o prompt sem aviso.</p>}
      <p className="text-[12px] text-ink-3">
        {[
          d.duracaoMs != null && `Jev respondeu em ${(d.duracaoMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`,
          d.tokens && `${d.tokens.entrada + d.tokens.saida} tokens`,
        ]
          .filter(Boolean)
          .join(", ")}
      </p>
    </div>
  );
}

function Nota({ nota }: { nota: number | null }) {
  return (
    <span className="flex shrink-0 flex-col items-end">
      <span className={`readout text-[22px] leading-none ${nota === null ? "text-ink-3" : "text-ink"}`}>{nota ?? "–"}</span>
      <span className="mt-0.5 text-[11px] text-ink-3">nota</span>
    </span>
  );
}

/** Nome do projeto no item, só quando a lista mistura projetos. */
function Origem({ origem }: { origem: string | null }) {
  return origem ? <span className="text-[12px] text-ink-2">{origem}</span> : null;
}

function ItemPrompt({ p, mostrarOrigem }: { p: Prompt; mostrarOrigem: boolean }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const e = ENTRADA[p.semaforo];
  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Status level={e.level} label={e.label} />
            <Origem origem={mostrarOrigem ? p.origem : null} />
            <span className="text-[12px] text-ink-3">{p.avaliacao ? AVALIACAO[p.avaliacao] : "antes da Jev"}</span>
            <time className="tnum text-[12px] text-ink-3" dateTime={new Date(p.ts).toISOString()}>
              {clock(p.ts)}
            </time>
          </span>
          <span className={`mt-1 text-[13.5px] leading-relaxed [overflow-wrap:anywhere] ${aberto ? "block whitespace-pre-wrap" : "line-clamp-2"}`}>{p.texto}</span>
        </span>
        <Nota nota={p.avaliacao === "jev" ? p.nota : null} />
        <ChevronDown size={15} aria-hidden className={`mt-1 shrink-0 text-ink-3 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      <div id={id} hidden={!aberto} className="border-t border-line-soft bg-bg/40 px-4 py-3">
        <Detalhe d={p} />
      </div>
    </li>
  );
}

function ItemComando({ c, mostrarOrigem }: { c: Comando; mostrarOrigem: boolean }) {
  // Comandos reais podem ter centenas de linhas (heredocs): fechado mostra 2, aberto rola sozinho.
  const [aberto, setAberto] = useState(false);
  const Icone = c.tipo === "arquivo" ? FileText : Terminal;
  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
      >
        <Icone size={14} aria-label={c.tipo === "arquivo" ? "arquivo" : "comando"} className="mt-0.5 shrink-0 text-ink-3" />
        <code
          className={`min-w-0 flex-1 font-mono text-[12.5px] leading-relaxed text-ink-2 [overflow-wrap:anywhere] ${
            aberto ? "block max-h-[50vh] overflow-y-auto whitespace-pre-wrap" : "line-clamp-2"
          }`}
        >
          {c.alvo}
        </code>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {c.semaforo === "segurado" ? <Status level="critical" label="segurado" /> : <Status level="good" label="liberado" />}
          <Origem origem={mostrarOrigem ? c.origem : null} />
          <span className="tnum text-[12px] text-ink-3">{clock(c.ts)}</span>
        </span>
      </button>
      {aberto && c.regra && <p className="px-4 pb-2.5 pl-11 text-[12.5px] text-critical">Regra: {c.regra}</p>}
    </li>
  );
}

function TestarPrompt({ projetos, inicial }: { projetos: ProjetoCrivo[]; inicial: string | null }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const escolhido = origem ?? inicial ?? projetos[0]?.origem ?? null;
  const descricao = projetos.find((p) => p.origem === escolhido)?.descricao;
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<Decisao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avaliando, setAvaliando] = useState(false);

  const avaliar = async () => {
    setAvaliando(true);
    setErro(null);
    setResultado(null);
    try {
      setResultado(await send<Decisao>("/api/crivo/avaliar", "POST", { texto, origem: escolhido }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAvaliando(false);
    }
  };

  return (
    <>
      <Button onClick={() => dialogo.current?.showModal()}>Testar um prompt</Button>
      <dialog
        ref={dialogo}
        aria-labelledby="crivo-teste-titulo"
        className="m-auto w-[min(42rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-bg/70"
      >
        <form
          method="dialog"
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim() && !avaliando) void avaliar();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="crivo-teste-titulo" className="text-[15px] font-semibold">
                Testar um prompt
              </h2>
              <p className="text-[12.5px] text-ink-3">Mostra o que o Crivo faria no Claude Code do projeto escolhido. Não grava nada.</p>
            </div>
            <Button onClick={() => dialogo.current?.close()}>Fechar</Button>
          </div>
          {projetos.length > 0 && escolhido && (
            <label className="block space-y-1">
              <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                Projeto
                <select
                  value={escolhido}
                  onChange={(e) => {
                    setOrigem(e.target.value);
                    setResultado(null);
                  }}
                  className={campo}
                >
                  {projetos.map((p) => (
                    <option key={p.origem} value={p.origem}>
                      {p.origem}
                    </option>
                  ))}
                </select>
              </span>
              {descricao && <span className="block text-[12px] text-ink-3">A Jev lê: {descricao}</span>}
            </label>
          )}
          <label className="block">
            <span className="sr-only">Prompt</span>
            <textarea
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setResultado(null);
                setErro(null);
              }}
              rows={5}
              placeholder="Escreva o pedido como mandaria ao Claude Code"
              className="w-full resize-y rounded-md border border-line bg-bg px-3 py-2 text-[13.5px] leading-relaxed outline-none focus-visible:border-ice-dim"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button tone="primary" type="submit" disabled={!texto.trim() || avaliando}>
              Avaliar
            </Button>
            <span aria-live="polite" className="text-[12.5px] text-ink-3">
              {avaliando ? "Avaliando…" : ""}
            </span>
          </div>
          {erro && <ErrorNote>{erro}</ErrorNote>}
          {resultado && (
            <div className="space-y-3 rounded-md border border-line-soft p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex flex-wrap items-center gap-x-3">
                  <Status level={ENTRADA[resultado.semaforo].level} label={ENTRADA[resultado.semaforo].label} />
                  <span className="text-[12px] text-ink-3">{AVALIACAO[resultado.avaliacao]}</span>
                </span>
                <Nota nota={resultado.avaliacao === "jev" ? resultado.nota : null} />
              </div>
              <Detalhe d={resultado} />
            </div>
          )}
        </form>
      </dialog>
    </>
  );
}

/** `agora` é a hora da última consulta: renderizar não pode chamar Date.now(). */
function Sinal({ ts, agora }: { ts: number | null; agora: number }) {
  if (ts === null) return <Status level="info" label="Nenhum gancho recebido ainda" />;
  const recente = agora - ts < 15 * 60_000;
  return <Status level={recente ? "good" : "info"} label={`Último gancho ${ago(ts, agora)}`} />;
}

function LinhaProjeto({ p, agora }: { p: ProjetoCrivo; agora: number }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudar = async (mudanca: { descricao?: string | null; desligado?: boolean }) => {
    setSalvando(true);
    setErro(null);
    try {
      await send("/api/crivo/projetos", "POST", { origem: p.origem, ...mudanca });
      await qc.invalidateQueries();
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13.5px] font-medium text-ink">{p.origem}</span>
        {p.desligado ? <Status level="warning" label="Crivo desligado" /> : <Status level="good" label="Crivo ligado" />}
        <span className="text-[12px] text-ink-3">
          {p.prompts} {p.prompts === 1 ? "prompt" : "prompts"}, último gancho {ago(p.vistoEm, agora)}
        </span>
        <span className="ml-auto flex gap-2">
          {!editando && (
            <Button
              onClick={() => {
                setRascunho(p.fonte === "manual" ? p.descricao : "");
                setEditando(true);
              }}
            >
              Editar descrição
            </Button>
          )}
          <Button disabled={salvando} tone={p.desligado ? "primary" : "default"} onClick={() => void mudar({ desligado: !p.desligado })}>
            {p.desligado ? "Ligar o Crivo" : "Desligar o Crivo"}
          </Button>
        </span>
      </div>
      {editando ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void mudar({ descricao: rascunho });
          }}
        >
          <label className="block">
            <span className="text-[12px] text-ink-3">O que a Jev deve saber deste projeto, em uma ou duas frases</span>
            <textarea
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder={p.fonte === "manual" ? "" : p.descricao}
              className={`mt-1 block w-full resize-y leading-relaxed ${campo}`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" type="submit" disabled={salvando || !rascunho.trim()}>
              Salvar descrição
            </Button>
            {p.fonte === "manual" && (
              <Button disabled={salvando} onClick={() => void mudar({ descricao: null })}>
                Voltar para a automática
              </Button>
            )}
            <Button onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
          {p.descricao} <span className="text-[12px] text-ink-3">({FONTE[p.fonte]})</span>
        </p>
      )}
      {erro && <ErrorNote>{erro}</ErrorNote>}
    </li>
  );
}

export function CrivoView() {
  const [origem, setOrigem] = useState<string | null>(null);
  const q = useLive<Feed>(origem ? `/api/crivo?origem=${encodeURIComponent(origem)}` : "/api/crivo", 2_000, {
    placeholderData: (anterior) => anterior,
  });
  const [aba, setAba] = useState<"entrada" | "saida">("entrada");
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const d = q.data;
  const todos = origem === null;

  return (
    <>
      <PageHeader
        title="Crivo"
        sub="Os dois portões do Claude Code, em todos os projetos. Na entrada, a Jev avalia cada prompt antes de o Claude ler: passa, pede para o Claude perguntar antes ou barra. Na saída, cada comando e arquivo fica registrado."
        right={
          <div className="flex flex-wrap items-center gap-3">
            <Sinal ts={d.ultimoSinal} agora={q.dataUpdatedAt} />
            <TestarPrompt projetos={d.projetos} inicial={origem} />
          </div>
        }
      />
      {!d.jevLigada && (
        <div className="mb-5">
          <ErrorNote>
            Falta <code className="font-mono">TYPESAFE_API_KEY</code> no <code className="font-mono">.env.local</code>: os prompts passam como &quot;não
            avaliado&quot;.
          </ErrorNote>
        </div>
      )}
      <label className="mb-3 flex items-center gap-2 text-[12.5px] text-ink-2">
        Projeto
        <select value={origem ?? ""} onChange={(e) => setOrigem(e.target.value || null)} className={campo}>
          <option value="">Todos os projetos</option>
          {d.projetos.map((p) => (
            <option key={p.origem} value={p.origem}>
              {p.origem}
              {p.desligado ? " (desligado)" : ""}
            </option>
          ))}
        </select>
      </label>
      <section className="mb-5 grid grid-cols-2 gap-6 rounded-lg border border-line-soft bg-surface p-5 sm:grid-cols-4">
        <Readout label="Passaram" value={d.placar.passaram} sub="prompts" />
        <Readout label="Perguntar antes" value={d.placar.perguntas} sub="o Claude recebeu aviso" />
        <Readout label="Barrados" value={d.placar.barrados} sub="não chegaram ao Claude" />
        <Readout label="Segurados" value={d.placar.segurados} sub="comandos e arquivos" />
      </section>

      <div className="mb-5">
        <Panel title="Projetos" aside="a Jev julga cada pedido sabendo do que é o projeto" pad={false}>
          {d.projetos.length ? (
            <ul className="divide-y divide-line-soft">
              {d.projetos.map((p) => (
                <LinhaProjeto key={p.origem} p={p} agora={q.dataUpdatedAt} />
              ))}
            </ul>
          ) : (
            <Empty>Os projetos aparecem aqui no primeiro gancho de cada um.</Empty>
          )}
        </Panel>
      </div>
      <div className="mb-3 md:hidden">
        <Segmented
          label="Portão"
          value={aba}
          onChange={setAba}
          options={[
            { value: "entrada", label: "Entrada" },
            { value: "saida", label: "Saída" },
          ]}
        />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className={aba === "entrada" ? "" : "max-md:hidden"}>
          <Panel voice="aurora" title="Portão de entrada" aside={`${d.prompts.length} mais recentes`} pad={false}>
            {d.prompts.length ? (
              <ul className="divide-y divide-line-soft">
                {d.prompts.map((p) => (
                  <ItemPrompt key={p.id} p={p} mostrarOrigem={todos} />
                ))}
              </ul>
            ) : (
              <Empty>Nenhum prompt ainda. Mande um no Claude Code de qualquer projeto.</Empty>
            )}
          </Panel>
        </div>
        <div className={aba === "saida" ? "" : "max-md:hidden"}>
          <Panel title="Portão de saída" aside="só registra, por enquanto" pad={false}>
            {d.comandos.length ? (
              <ul className="divide-y divide-line-soft">
                {d.comandos.map((c) => (
                  <ItemComando key={c.id} c={c} mostrarOrigem={todos} />
                ))}
              </ul>
            ) : (
              <Empty>Nenhum comando ou arquivo ainda.</Empty>
            )}
          </Panel>
        </div>
      </div>
      <p className="mt-4 max-w-[80ch] text-[12px] text-ink-3">
        O que a Jev confere em cada pedido: {Object.values(ROTULO_FALTA).join("; ")}. Faltando 1 ou 2, o Claude pergunta antes de começar; 3 ou mais, o
        prompt é barrado. Comece com &gt;&gt; para passar sem avaliação.
      </p>

    </>
  );
}

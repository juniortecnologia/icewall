"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { bancada, ResultadoBancada } from "@/server/queries";
import { send, useLive } from "@/lib/api";
import { dateTime, num, seconds } from "@/lib/format";
import { Button, Code, Empty, ErrorNote, Loading, Meter, PageHeader, Panel, Status, Table } from "../ui";

type B = ReturnType<typeof bancada>;
type Linha = Record<string, unknown>;

const n = (v: unknown, d = 1) => (typeof v === "number" ? num(v, d) : "—");
const linhas = (r?: ResultadoBancada): Linha[] => ((r?.metricas?.linhas as Linha[] | undefined) ?? []);

function Veredito({ r }: { r?: ResultadoBancada }) {
  if (!r) return <span className="text-ink-3">não rodou</span>;
  if (!r.ok && !r.resumo) return <Status level="critical" label="falhou" />;
  if (!r.resumo) return <span className="text-ink-3">sem a linha de 7</span>;
  const { passa, ttftP95, tokSPorUsuario, motivos } = r.resumo;
  return (
    <div className="space-y-0.5">
      <Status level={passa ? "good" : "critical"} label={passa ? "passa" : "não passa"} />
      <div className="tnum text-[12px] text-ink-2">
        1º token {num(ttftP95, 1)} s · {num(tokSPorUsuario, 1)} tok/s cada
      </div>
      {!passa && <div className="max-w-[34ch] text-[12px] text-ink-3">{motivos.join("; ")}</div>}
    </div>
  );
}

function memMin(porTask: Record<string, ResultadoBancada> | undefined): number | null {
  const v = Object.values(porTask ?? {})
    .map((r) => r.metricas?.memMinMb)
    .filter((x): x is number => typeof x === "number");
  return v.length ? Math.min(...v) : null;
}

function Detalhe({ comb, porTask, cenarios }: { comb: B["combinacoes"][number]; porTask: Record<string, ResultadoBancada>; cenarios: B["cenarios"] }) {
  const carga = linhas(porTask.carga);
  const subida = porTask.subida;
  return (
    <div className="space-y-4">
      <p className="max-w-[80ch] text-[13px] text-ink-2">{comb.descricao}</p>
      {subida && (
        <p className="text-[12.5px] text-ink-2">
          Subida:{" "}
          {subida.ok
            ? Object.entries((subida.metricas?.segundos as Record<string, number>) ?? {})
                .map(([c, s]) => `${c} ${seconds(s)}`)
                .join(" · ")
            : <span className="text-critical">falhou em {String(subida.metricas?.falhou ?? "?")}</span>}
        </p>
      )}
      {subida?.error && <Code>{subida.error}</Code>}
      {carga.length > 0 && (
        <Table head={["Simultâneos", "1º token (mediana)", "1º token (p95)", "1º token (máx.)", "tok/s por usuário", "tok/s no total", "Erros"]} dense>
          {carga.map((l) => (
            <tr key={String(l.conc)}>
              <td className="tnum">{String(l.conc)}</td>
              <td className="tnum">{n(l.ttft_med)} s</td>
              <td className="tnum">{n(l.ttft_p95)} s</td>
              <td className="tnum">{n(l.ttft_max)} s</td>
              <td className="tnum">{n(l.dec_tps_por_req)}</td>
              <td className="tnum">{n(l.dec_tps_agregado)}</td>
              <td className="tnum">{String(l.erros ?? 0)}</td>
            </tr>
          ))}
        </Table>
      )}
      {cenarios
        .filter((c) => c.id !== "carga" && porTask[c.id])
        .map((c) => {
          const r = porTask[c.id];
          const acertos = r.metricas?.acertos as { ok: number; total: number } | null | undefined;
          return (
            <div key={c.id}>
              <h3 className="mb-1 flex flex-wrap items-center gap-2 text-[13px] font-medium">
                {c.titulo}
                <Status level={r.ok ? "good" : "critical"} label={r.ok ? "rodou" : "falhou"} />
                {acertos && <span className="tnum text-ink-2">{acertos.ok}/{acertos.total} certas</span>}
                {r.resumo && <span className="tnum text-[12px] text-ink-2">chat com 7: 1º token {num(r.resumo.ttftP95, 1)} s · {num(r.resumo.tokSPorUsuario, 1)} tok/s cada</span>}
                <span className="text-[12px] text-ink-3">{dateTime(r.ts)}</span>
              </h3>
              <Code>{[...linhas(r).map((l) => JSON.stringify(l)), String(r.metricas?.texto ?? "")].filter(Boolean).join("\n") || r.error || "sem saída"}</Code>
            </div>
          );
        })}
    </div>
  );
}

function NovaRodada({ d }: { d: B }) {
  const qc = useQueryClient();
  const [combs, setCombs] = useState<string[]>([]);
  const [cens, setCens] = useState<string[]>(["carga", "rag-qualidade"]);
  const [samples, setSamples] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = async () => {
    setErr(null);
    try {
      await send("/api/bench", "POST", { kind: "spark", models: combs, tasks: cens, samples });
      setCombs([]);
      void qc.invalidateQueries();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  return (
    <Panel title="Nova rodada">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-[12px] text-ink-3">Combinações</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {d.combinacoes.map((c) => (
              <label key={c.id} className="flex items-start gap-1.5 text-[13px]" title={c.descricao}>
                <input type="checkbox" checked={combs.includes(c.id)} onChange={() => setCombs(toggle(combs, c.id))} className="mt-0.5 accent-[var(--ice)]" />
                {c.titulo}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-[12px] text-ink-3">Cenários (cada combinação roda só os que cabem nela)</legend>
          <div className="grid gap-1.5">
            {d.cenarios.map((c) => (
              <label key={c.id} className="flex items-start gap-1.5 text-[13px]">
                <input type="checkbox" checked={cens.includes(c.id)} onChange={() => setCens(toggle(cens, c.id))} className="mt-0.5 accent-[var(--ice)]" />
                <span>
                  {c.titulo}
                  {c.precisa.length > 0 && <span className="text-[12px] text-ink-3"> · precisa de {c.precisa.join(", ")}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            Amostras
            <input
              type="number"
              min={1}
              max={5}
              value={samples}
              onChange={(e) => setSamples(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
              className="w-14 rounded-md border border-line bg-bg px-2 py-0.5 text-ink"
            />
          </label>
          <Button tone="primary" onClick={submit} disabled={!combs.length || !cens.length}>
            Pôr na fila
          </Button>
          {err && <span className="text-[12.5px] text-critical">{err}</span>}
        </div>
        <p className="text-[12px] text-ink-3">
          Durante a rodada o Ollama fica parado e as delegações esperam. Cada combinação sobe do zero (5 a 15 min por serviço na primeira vez) e é derrubada no fim; o
          Ollama volta sozinho.
        </p>
      </div>
    </Panel>
  );
}

export function BancadaView() {
  const q = useLive<B>("/api/bancada", 4000);
  const qc = useQueryClient();
  const [aberta, setAberta] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const d = q.data;
  const cancel = async (id: number) => {
    await send(`/api/bench/${id}`, "DELETE");
    void qc.invalidateQueries();
  };

  return (
    <>
      <PageHeader
        title="Bancada do Spark"
        sub={`Qual combinação de modelos o Spark aguenta na Plataforma IA eFacini. Meta do chat com ${d.metas.conc} pessoas ao mesmo tempo: primeiro token em até ${d.metas.ttftS} s e pelo menos ${d.metas.tokS} tok/s para cada uma.`}
      />

      <Panel title="Combinações" pad={false} aside="último resultado de cada cenário">
        <Table head={["Combinação", "Chat sozinho com 7", "Chat com tudo junto", "RAG em PT-BR", "Menor memória livre", ""]}>
          {d.combinacoes.map((c) => {
            const p = d.ultimos[c.id];
            const conv = p?.convivencia ?? p?.["convivencia-sem-codigo"];
            const rag = p?.["rag-qualidade"]?.metricas?.acertos as { ok: number; total: number } | null | undefined;
            const mem = memMin(p);
            return (
              <tr key={c.id} className="align-top">
                <td className="max-w-[34ch]">
                  <div className="font-medium">{c.titulo}</div>
                  <div className="text-[12px] text-ink-3">{c.servicos.map((s) => s.container.replace("glis-", "")).join(" + ")}{c.gate ? " + gate" : ""}</div>
                </td>
                <td>
                  <Veredito r={p?.carga} />
                </td>
                <td>
                  <Veredito r={conv} />
                </td>
                <td className="tnum">{rag ? `${rag.ok}/${rag.total}` : "—"}</td>
                <td className="tnum">{mem != null ? `${num(mem / 1024, 1)} GB` : "—"}</td>
                <td>{p && <Button onClick={() => setAberta(aberta === c.id ? null : c.id)}>{aberta === c.id ? "Fechar" : "Detalhes"}</Button>}</td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      {aberta && d.ultimos[aberta] && (
        <Panel title={d.combinacoes.find((c) => c.id === aberta)?.titulo} className="mt-5">
          <Detalhe comb={d.combinacoes.find((c) => c.id === aberta)!} porTask={d.ultimos[aberta]} cenarios={d.cenarios} />
        </Panel>
      )}

      <div className="mt-5">
        <NovaRodada d={d} />
      </div>

      <Panel title="Rodadas" className="mt-5" pad={false}>
        {d.runs.length ? (
          <Table head={["#", "Criada", "Combinações", "Progresso", "Situação", ""]}>
            {d.runs.map((r) => (
              <tr key={r.id}>
                <td className="tnum text-ink-3">{r.id}</td>
                <td className="tnum whitespace-nowrap text-ink-2">{dateTime(r.createdAt)}</td>
                <td className="max-w-[36ch] text-[12.5px]">{r.models.join(", ")}</td>
                <td className="w-56">
                  <div className="tnum mb-1 text-[12px] text-ink-2">
                    {r.done}/{r.total || "?"} {r.current && <span className="text-ink-3">· {r.current}</span>}
                  </div>
                  <Meter value={r.done} max={r.total || 1} label={`Progresso da rodada ${r.id}`} />
                </td>
                <td>
                  <Status
                    level={r.status === "done" ? "good" : r.status === "failed" ? "critical" : "info"}
                    label={{ queued: "na fila", running: "rodando", done: "concluída", failed: "falhou", cancelled: "cancelada" }[r.status]}
                  />
                  {r.error && <div className="max-w-[30ch] text-[12px] text-critical">{r.error}</div>}
                </td>
                <td>{(r.status === "queued" || r.status === "running") && <Button onClick={() => cancel(r.id)}>Cancelar</Button>}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma rodada ainda.</Empty>
        )}
      </Panel>
    </>
  );
}

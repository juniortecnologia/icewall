"use client";
import { useState } from "react";
import type { delegations } from "@/server/queries";
import { useLive } from "@/lib/api";
import { compact, dateTime, num, pct, seconds } from "@/lib/format";
import { BarList } from "../charts";
import { Empty, ErrorNote, Jev, yesNo, Loading, PageHeader, Panel, Readout, Segmented, Status, Table } from "../ui";

type D = ReturnType<typeof delegations>;
type Group = D["byModel"][number];

const EXIT: Record<number, string> = {
  0: "ok",
  2: "servidor/modelo indisponível",
  3: "contexto grande demais",
  4: "segredo no pedido",
  5: "sem código usável",
  6: "testes ainda falham",
};

export const CAUSE_LABEL: Record<string, string> = {
  ambiguous_spec: "pedido ambíguo",
  missing_context: "faltou contexto",
  logic_error: "erro de lógica",
  format_or_extraction: "formato/extração",
  invented_api: "API inventada",
  code_quality: "qualidade do código",
  test_environment: "ambiente de teste",
  too_complex: "complexa demais",
  infrastructure: "infraestrutura",
  none: "nenhuma",
};
const ROUTE_LABEL: Record<string, string> = { local_fast: "fast", local_quality: "quality", claude_direct: "Claude direto" };
const BOTTLENECK_LABEL: Record<string, string> = {
  generation: "geração",
  model_load: "carga do modelo",
  test_loop: "rodadas de teste",
  large_context: "contexto grande",
  slow_generation: "geração lenta",
  none: "nada se destaca",
};
const VERDICT_LABEL: Record<string, string> = { accepted: "aceito", fixed: "corrigido", rejected: "rejeitado" };

function GroupTable({ rows, label }: { rows: Group[]; label: string }) {
  if (!rows.length) return <Empty>Sem dados.</Empty>;
  return (
    <Table head={[label, "Execuções", "Aproveitadas", "1ª rodada", "Rodadas", "tok/s", "Duração"]} dense>
      {rows.map((g) => (
        <tr key={g.key}>
          <td className="font-medium">{g.key}</td>
          <td className="tnum">{g.n}</td>
          <td className="tnum">{pct(g.ok / g.n)}</td>
          <td className="tnum">{pct(g.firstTry / g.n)}</td>
          <td className="tnum">{num(g.avgRounds, 1)}</td>
          <td className="tnum">{num(g.avgTokS)}</td>
          <td className="tnum">{seconds(g.avgDuration)}</td>
        </tr>
      ))}
    </Table>
  );
}

export function DelegationsView() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [bench, setBench] = useState<"0" | "1">("0");
  const q = useLive<D>(`/api/delegations?days=${days}&bench=${bench}`, 15_000);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const d = q.data;
  const n = d.runs.length;
  const ok = d.runs.filter((r) => r.success).length;
  const first = d.runs.filter((r) => r.success && r.rounds === 1).length;
  const reviewed = d.runs.filter((r) => r.verdict).length;

  return (
    <>
      <PageHeader
        title="Delegações"
        sub="O que o Claude entregou aos modelos locais, como foi e o veredito da revisão. Os julgamentos em violeta são da Jev."
        right={
          <div className="flex flex-wrap gap-2">
            <Segmented label="Incluir benchmarks" value={bench} onChange={setBench} options={[{ value: "0", label: "Uso real" }, { value: "1", label: "Com benchmarks" }]} />
            <Segmented label="Período" value={days} onChange={setDays} options={[{ value: "7", label: "7 d" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }]} />
          </div>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-6 rounded-lg border border-line-soft bg-surface p-5 sm:grid-cols-5">
        <Readout label="Execuções" value={n} />
        <Readout label="Aproveitadas" value={n ? pct(ok / n) : "—"} sub={`${ok} de ${n}`} />
        <Readout label="Na 1ª rodada" value={n ? pct(first / n) : "—"} />
        <Readout label="Com veredito" value={n ? pct(reviewed / n) : "—"} sub="ollama-delegate review" />
        <Readout label="Tokens gerados no Spark" value={compact(d.runs.reduce((a, r) => a + (r.evalTokens ?? 0), 0))} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Por modelo" pad={false}>
          <GroupTable rows={d.byModel} label="Modelo" />
        </Panel>
        <Panel title="Por tipo de tarefa" voice="aurora" pad={false}>
          <GroupTable rows={d.byKind} label="Tipo (Jev)" />
        </Panel>
        <Panel title="Onde erram" voice="aurora" aside="causa principal, segundo a Jev">
          <BarList color="var(--aurora)" rows={d.failureCauses.map((c) => ({ key: c.key, label: CAUSE_LABEL[c.key] ?? c.key, value: c.n, display: c.n }))} empty="Nenhuma falha classificada ainda." />
        </Panel>
        <Panel title="Gargalos" voice="aurora" aside="o que dominou o tempo">
          <BarList color="var(--aurora)" rows={d.bottlenecks.map((c) => ({ key: c.key, label: BOTTLENECK_LABEL[c.key] ?? c.key, value: c.n, display: c.n }))} empty="Sem julgamentos de gargalo ainda." />
        </Panel>
        <Panel title="Vereditos da revisão do Claude">
          <BarList rows={d.verdicts.map((c) => ({ key: c.key, label: VERDICT_LABEL[c.key] ?? c.key, value: c.n, display: c.n }))} />
        </Panel>
        <Panel title="Por projeto" pad={false}>
          <GroupTable rows={d.byProject} label="Projeto" />
        </Panel>
      </div>

      <Panel title="Execuções" className="mt-5" aside={`${n} no período`} pad={false}>
        {n ? (
          <Table head={["Quando", "Projeto", "Nível · modelo", "Resultado", "Rodadas", "tok/s", "Duração", "Revisão", "Jev"]}>
            {d.runs.map((r) => (
              <tr key={r.runId}>
                <td className="tnum whitespace-nowrap text-ink-2">{dateTime(r.ts)}</td>
                <td>{r.project ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {r.tier} <span className="text-ink-3">· {r.model ?? "?"}</span>
                  {r.label && <span className="ml-1 text-[11.5px] text-ink-3">[{r.label}]</span>}
                </td>
                <td>
                  <Status level={r.exitCode === 0 ? "good" : r.exitCode === 6 || r.exitCode === 5 ? "warning" : "critical"} label={EXIT[r.exitCode] ?? `código ${r.exitCode}`} />
                </td>
                <td className="tnum">{r.rounds ?? "—"}</td>
                <td className="tnum">{num(r.tokS)}</td>
                <td className="tnum">{seconds(r.durationS)}</td>
                <td className="max-w-[22ch]">
                  {r.verdict ? (
                    <details>
                      <summary className="cursor-pointer text-[12.5px]">{VERDICT_LABEL[r.verdict]}</summary>
                      {r.reason && <p className="mt-1 text-[12px] text-ink-2">{r.reason}</p>}
                    </details>
                  ) : (
                    <span className="text-[12px] text-ink-3">sem veredito</span>
                  )}
                </td>
                <td>
                  <div className="flex max-w-[30ch] flex-wrap gap-1">
                    {r.jev?.taskKind && <Jev label={r.jev.taskKind.choice} p={r.jev.taskKind.confidence} title="Tipo de tarefa" />}
                    {r.jev?.failureCause && r.jev.failureCause.choice !== "none" && (
                      <Jev label={CAUSE_LABEL[r.jev.failureCause.choice] ?? r.jev.failureCause.choice} p={r.jev.failureCause.confidence} title="Causa da falha" />
                    )}
                    {r.jev?.bestRoute && <Jev label={`→ ${ROUTE_LABEL[r.jev.bestRoute.choice]}`} p={r.jev.bestRoute.confidence} title="Melhor rota" />}
                    {r.jev?.worth != null && <Jev label={yesNo(r.jev.worth, "valeu", "não valeu", "valeu? incerto")} p={r.jev.worth} title="Delegar valeu a pena?" />}
                    {!r.jev && <span className="text-[12px] text-ink-3">aguardando</span>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma delegação no período. Cada `ollama-delegate run` aparece aqui em até 30 s.</Empty>
        )}
      </Panel>
    </>
  );
}

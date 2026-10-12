"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { tokens } from "@/server/queries";
import { useLive } from "@/lib/api";
import { compact, pct } from "@/lib/format";
import { BarList } from "../charts";
import { ErrorNote, Loading, PageHeader, Panel, Readout, Segmented, Table } from "../ui";

type T = ReturnType<typeof tokens>;

export function TokensView() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const q = useLive<T>(`/api/tokens?days=${days}`, 60_000);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const d = q.data;
  const sum = (k: "input" | "output" | "cacheRead" | "cacheCreation" | "thinking") => d.daily.reduce((a, r) => a + (r[k] ?? 0), 0);
  const input = sum("input");
  const cacheRead = sum("cacheRead");
  const cacheCreation = sum("cacheCreation");
  const output = sum("output");
  const totalIn = input + cacheRead + cacheCreation;
  const delegated = new Map(d.delegatedDaily.map((r) => [r.day, r.evalTokens]));
  const localTotal = d.delegatedDaily.reduce((a, r) => a + r.evalTokens, 0);
  const chart = d.daily.map((r) => ({ day: r.day.slice(5).split("-").reverse().join("/"), output: r.output, local: delegated.get(r.day) ?? 0 }));

  return (
    <>
      <PageHeader
        title="Tokens do Claude"
        sub="Lidos dos transcripts do Claude Code (~/.claude/projects). As delegações bem-sucedidas mostram quanto código saiu do Spark em vez do Claude."
        right={<Segmented label="Período" value={days} onChange={setDays} options={[{ value: "7", label: "7 d" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }]} />}
      />
      <section className="mb-5 grid grid-cols-2 gap-6 rounded-lg border border-line-soft bg-surface p-5 sm:grid-cols-5">
        <Readout label="Saída do Claude" value={compact(output)} sub={`${compact(sum("thinking"))} de raciocínio`} />
        <Readout label="Entrada total" value={compact(totalIn)} />
        <Readout label="Vinda do cache" value={totalIn ? pct(cacheRead / totalIn) : "—"} sub={`${compact(cacheCreation)} gravados`} />
        <Readout label="Escrita no Spark" value={compact(localTotal)} sub={`${pct(output ? localTotal / (output + localTotal) : 0)} do código gerado`} />
        <Readout label="Sessões" value={d.sessions} sub={`subagentes: ${compact(d.sidechainOutput)} de saída`} />
      </section>

      {d.jevRoi && (
        <section className="mb-5 rounded-lg border border-aurora-dim/60 bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[13px] font-semibold text-aurora">Consciência JEV: ROI & Economia Inteligente</span>
              <p className="text-[12px] text-ink-3">Balanço das decisões e auditorias da Jev sobre o consumo de tokens</p>
            </div>
            <span className="rounded bg-aurora-dim/20 px-2 py-0.5 text-[11px] font-mono text-aurora">
              {d.jevRoi.totalJudgments} julgamentos realizados
            </span>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Readout
              label="Economia direta de tokens"
              value={compact(d.jevRoi.tokensSavedByJev)}
              sub="Gerados no Spark em tarefas validadas"
            />
            <Readout
              label="Tokens gastos na Jev"
              value={compact(d.jevRoi.jevTokensSpent)}
              sub="Custo do TypeSafe para auditar e decidir"
            />
            <Readout
              label="Saldo líquido economizado"
              value={compact(d.jevRoi.netTokensSaved)}
              sub={`${compact(Math.round(d.jevRoi.netTokensSaved / 3.5))} palavras evitadas na nuvem`}
            />
            <Readout
              label="Taxa de assertividade"
              value={`${d.jevRoi.worthRatio}%`}
              sub={`${d.jevRoi.worthyCount} de ${d.jevRoi.delegationsEvaluated} delegações aprovadas`}
            />
          </div>
        </section>
      )}

      <Panel title="Por dia: saída do Claude e tokens escritos pelos modelos locais">
        <div className="h-64" role="img" aria-label="Tokens por dia">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="var(--line-soft)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis width={50} stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v)} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px]">
                      <div className="text-ink-3">{label}</div>
                      <div className="tnum">Claude: {compact(Number(payload[0]?.value))}</div>
                      <div className="tnum">Spark: {compact(Number(payload[1]?.value))}</div>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="output" name="Claude" fill="var(--s1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="local" name="Spark" fill="var(--s3)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 flex gap-5 text-[12.5px] text-ink-2">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--s1)" }} /> Saída do Claude
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--s3)" }} /> Tokens escritos no Spark (delegações ok)
          </li>
        </ul>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Saída por projeto">
          <BarList rows={d.byProject.map((p) => ({ key: p.project ?? "?", label: p.project ?? "?", value: p.output, display: compact(p.output) }))} />
        </Panel>
        <Panel title="Por modelo do Claude" pad={false}>
          <Table head={["Modelo", "Mensagens", "Saída", "Entrada", "Cache"]} dense>
            {d.byModel.map((m) => {
              const tin = m.input + m.cacheRead + m.cacheCreation;
              return (
                <tr key={m.model ?? "?"}>
                  <td>{m.model}</td>
                  <td className="tnum">{compact(m.messages)}</td>
                  <td className="tnum">{compact(m.output)}</td>
                  <td className="tnum">{compact(tin)}</td>
                  <td className="tnum">{tin ? pct(m.cacheRead / tin) : "—"}</td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      </div>
    </>
  );
}

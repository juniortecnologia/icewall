"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { auditor } from "@/server/queries";
import { send, useLive } from "@/lib/api";
import { ago, compact, dateTime } from "@/lib/format";
import { Button, Code, Empty, ErrorNote, Jev, yesNo, Loading, PageHeader, Panel, Readout, Segmented, Status, Table, severityLevel } from "../ui";

type A = ReturnType<typeof auditor>;
type AnswerJson = Record<string, { type: string; choice?: string; noul?: number; score?: number; confidence?: number }>;

const AREA: Record<string, string> = { delegation: "Delegação", models: "Modelos", os: "Sistema", security: "Segurança", tokens: "Tokens", containers: "Containers" };
const KIND: Record<string, string> = { delegation: "delegação", package: "pacote", port: "porta", prompt: "prompt (Crivo)" };

function Answers({ answers }: { answers: unknown }) {
  const a = (answers ?? {}) as AnswerJson;
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(a).map(([k, v]) => {
        const value = v.type === "choice" ? v.choice : v.type === "noul" ? yesNo(v.noul!) : v.score?.toFixed(2);
        const p = v.type === "noul" ? v.noul : v.confidence;
        return <Jev key={k} label={`${k}: ${value}`} p={p} />;
      })}
    </div>
  );
}

export function AuditorView() {
  const q = useLive<A>("/api/auditor", 15_000);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "dismissed" | "done">("open");
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const d = q.data;
  const recs = d.recommendations.filter((r) => r.status === filter);
  const setStatus = async (id: number, status: string) => {
    await send(`/api/recommendations/${id}`, "PATCH", { status });
    void qc.invalidateQueries();
  };
  const runNow = async () => {
    setBusy(true);
    try {
      await send("/api/jobs/recheck", "POST");
      await qc.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Auditor"
        sub="A Jev (TypeSafe) julga cada delegação, pacote e porta exposta; o ICEWALL combina esses julgamentos com as métricas e transforma em recomendações. Nada é aplicado sozinho."
        right={
          <div className="flex items-center gap-3">
            {d.sparkCheckedAt && <span className="text-[12px] text-ink-3">Spark lido {ago(d.sparkCheckedAt)}</span>}
            <Button tone="primary" onClick={runNow} disabled={busy}>
              {busy ? "Verificando…" : "Verificar o Spark agora"}
            </Button>
          </div>
        }
      />
      {!d.jev.enabled && (
        <div className="mb-5">
          <ErrorNote>
            A Jev está desligada: falta <code className="font-mono">TYPESAFE_API_KEY</code> em <code className="font-mono">.env.local</code>. As recomendações abaixo
            vêm só das regras do painel; reinicie o servidor depois de pôr a chave.
          </ErrorNote>
        </div>
      )}
      <section className="mb-5 grid grid-cols-2 gap-6 rounded-lg border border-aurora-dim/70 bg-surface p-5 sm:grid-cols-4">
        <Readout label="Julgamentos" value={d.totals?.calls ?? 0} sub={`${d.totals?.errors ?? 0} com erro`} />
        <Readout label="Tokens de entrada (Jev)" value={compact(d.totals?.input)} />
        <Readout label="Tokens de saída (Jev)" value={compact(d.totals?.output)} />
        <Readout label="Modelo" value={<span className="text-[18px]">{d.jev.model}</span>} sub={d.byKind.map((k) => `${KIND[k.kind] ?? k.kind}: ${k.n}`).join(", ") || "nenhum julgamento ainda"} />
      </section>

      <Panel
        voice="aurora"
        title="Recomendações"
        aside={
          <Segmented
            label="Situação"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Abertas" },
              { value: "dismissed", label: "Dispensadas" },
              { value: "done", label: "Resolvidas" },
            ]}
          />
        }
        pad={false}
      >
        {recs.length ? (
          <ul className="divide-y divide-line-soft">
            {recs.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Status level={severityLevel(r.severity)} label="" />
                      <span className="text-[12px] text-ink-3">{AREA[r.area]}</span>
                      <span className="font-medium">{r.title}</span>
                      {r.confidence != null && <Jev label="Jev" p={r.confidence} />}
                    </div>
                    <p className="mt-1 max-w-[80ch] text-[13px] text-ink-2">{r.detail}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {r.status === "open" ? (
                      <>
                        <Button onClick={() => setStatus(r.id, "done")}>Marcar como feito</Button>
                        <Button onClick={() => setStatus(r.id, "dismissed")}>Dispensar</Button>
                      </>
                    ) : (
                      <Button onClick={() => setStatus(r.id, "open")}>Reabrir</Button>
                    )}
                  </div>
                </div>
                {r.action && (
                  <div className="mt-2">
                    <Code>{r.action}</Code>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma recomendação nesta lista.</Empty>
        )}
      </Panel>

      <Panel voice="aurora" title="Julgamentos recentes" className="mt-5" pad={false}>
        {d.judgments.length ? (
          <Table head={["Quando", "Assunto", "Respostas", "Tokens"]} dense>
            {d.judgments.map((j) => (
              <tr key={j.id}>
                <td className="tnum whitespace-nowrap text-ink-2">{dateTime(j.ts)}</td>
                <td className="max-w-[30ch] truncate">
                  <span className="text-ink-3">{KIND[j.subjectKind] ?? j.subjectKind}</span> {j.subjectId}
                </td>
                <td>{j.error ? <span className="text-[12px] text-critical">{j.error}</span> : <Answers answers={j.answers} />}</td>
                <td className="tnum text-ink-2">{j.inputTokens + j.outputTokens || "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>{d.jev.enabled ? "A primeira rodada do auditor sai em até 5 minutos." : "Sem julgamentos: a Jev está desligada."}</Empty>
        )}
      </Panel>
    </>
  );
}

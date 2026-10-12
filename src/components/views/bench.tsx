"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { bench } from "@/server/queries";
import type { Weights } from "@/server/bench/leaderboard";
import { getJson, send, useLive } from "@/lib/api";
import { dateTime, num, pct, seconds } from "@/lib/format";
import { ActionButton, Button, Empty, ErrorNote, Loading, Meter, PageHeader, Panel, Segmented, Status, Table } from "../ui";

type B = ReturnType<typeof bench>;

const WEIGHT_LABEL: Record<keyof Weights, string> = {
  quality: "Acerto nas tarefas",
  firstTry: "Acerto na 1ª rodada",
  speed: "Velocidade de geração",
  latency: "Tempo até o 1º token",
  memory: "Memória ocupada",
};

function NewRun({ data }: { data: B }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"quality" | "perf">("quality");
  const [models, setModels] = useState<string[]>(() => data.tiers.map((t) => t.model).filter((m, i, a) => a.indexOf(m) === i));
  const [tasks, setTasks] = useState<string[]>(() => data.tasks.map((t) => t.id));
  const [samples, setSamples] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = async () => {
    setErr(null);
    try {
      await send("/api/bench", "POST", { kind, models, tasks, samples });
      void qc.invalidateQueries();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const items = kind === "quality" ? models.length * tasks.length * samples : models.length * samples * 4;
  return (
    <Panel title="Novo benchmark">
      <div className="space-y-4">
        <Segmented
          label="Tipo"
          value={kind}
          onChange={setKind}
          options={[
            { value: "quality", label: "Qualidade (tarefas com testes)" },
            { value: "perf", label: "Performance (tok/s, latência)" },
          ]}
        />
        <fieldset>
          <legend className="mb-1.5 text-[12px] text-ink-3">Modelos</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {data.models.map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" checked={models.includes(m)} onChange={() => setModels(toggle(models, m))} className="accent-[var(--ice)]" />
                {m}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === "quality" && (
          <fieldset>
            <legend className="mb-1.5 text-[12px] text-ink-3">Tarefas</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {data.tasks.map((t) => (
                <label key={t.id} className="flex items-center gap-1.5 text-[13px]" title={t.description}>
                  <input type="checkbox" checked={tasks.includes(t.id)} onChange={() => setTasks(toggle(tasks, t.id))} className="accent-[var(--ice)]" />
                  {t.title}
                </label>
              ))}
            </div>
          </fieldset>
        )}
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
          <Button tone="primary" onClick={submit} disabled={!models.length || (kind === "quality" && !tasks.length)}>
            Pôr na fila ({items} itens)
          </Button>
          {err && <span className="text-[12.5px] text-critical">{err}</span>}
        </div>
        <p className="text-[12px] text-ink-3">
          Qualidade roda o pipeline real do delegate-local (`--model M --label bench`), com até 3 rodadas de teste. Performance segura o lock das delegações e
          descarrega os modelos para medir a carga a frio.
        </p>
      </div>
    </Panel>
  );
}

function WeightsPanel({ weights }: { weights: Weights }) {
  const qc = useQueryClient();
  const [w, setW] = useState(weights);
  const save = async (next: Weights) => {
    setW(next);
    await send("/api/bench/weights", "PUT", next);
    void qc.invalidateQueries();
  };
  return (
    <Panel title="Pesos do score">
      <div className="space-y-3">
        {(Object.keys(WEIGHT_LABEL) as (keyof Weights)[]).map((k) => (
          <label key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="text-ink-2">{WEIGHT_LABEL[k]}</span>
            <span className="tnum text-ink">{Math.round(w[k] * 100)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={w[k]}
              onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })}
              onPointerUp={() => void save(w)}
              onKeyUp={() => void save(w)}
              className="col-span-2 accent-[var(--ice)]"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">Mudar os pesos só reordena: não roda nada de novo.</p>
    </Panel>
  );
}

function ApplyTier({ model, tiers }: { model: string; tiers: B["tiers"] }) {
  // Só vêm os níveis do Ollama: um nível no vLLM (o fast do Glis) não troca de modelo por aqui.
  const [tier, setTier] = useState(() => tiers[0]?.name ?? "");
  const [diff, setDiff] = useState<{ before: string; after: string } | null>(null);
  if (!tiers.length) return null;
  const current = tiers.find((t) => t.name === tier)?.model;
  if (current === model) return <span className="text-[12px] text-ink-3">é o {tier}</span>;
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5">
        <select value={tier} onChange={(e) => { setTier(e.target.value); setDiff(null); }} className="rounded border border-line bg-bg px-1 py-0.5 text-[12px]" aria-label="Nível">
          {tiers.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </select>
        {!diff && (
          <Button onClick={async () => setDiff(await getJson(`/api/bench/tier-preview?tier=${tier}&model=${encodeURIComponent(model)}`))}>Ver diff</Button>
        )}
      </span>
      {diff && (
        <span className="space-y-1">
          <code className="block font-mono text-[11px] text-critical/90">- {diff.before}</code>
          <code className="block font-mono text-[11px] text-good">+ {diff.after}</code>
          <ActionButton action="tier.set" target={tier} arg={model} label="Aplicar no models.json" confirm={`Trocar o nível ${tier} para ${model}?`} />
        </span>
      )}
    </span>
  );
}

export function BenchView() {
  const q = useLive<B>("/api/bench", 4000);
  const qc = useQueryClient();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const d = q.data;
  const taskIds = d.tasks.map((t) => t.id);
  const cancel = async (id: number) => {
    await send(`/api/bench/${id}`, "DELETE");
    void qc.invalidateQueries();
  };

  return (
    <>
      <PageHeader title="Benchmarks" sub="Qual modelo usar em cada nível: qualidade nas tarefas com testes, velocidade e memória, combinados num score com os seus pesos." />

      <Panel title="Ranking" pad={false} aside={d.board.length ? `${d.board.length} modelos medidos` : undefined}>
        {d.board.length ? (
          <Table head={["#", "Modelo", "Score", "Acerto", "1ª rodada", "Por tarefa", "tok/s", "1º token (8k)", "Carga", "Memória", "Nível"]}>
            {d.board.map((s, i) => (
              <tr key={s.model}>
                <td className="tnum text-ink-3">{i + 1}</td>
                <td className="font-medium">{s.model}</td>
                <td className="w-28">
                  <div className="tnum mb-1">{s.score.toFixed(2)}</div>
                  <Meter value={s.score} label={`Score de ${s.model}`} />
                </td>
                <td className="tnum">{s.passRate != null ? `${pct(s.passRate)}` : "—"} <span className="text-[12px] text-ink-3">{s.qualityRuns ? `(${s.qualityRuns})` : ""}</span></td>
                <td className="tnum">{pct(s.firstTryRate)}</td>
                <td>
                  <div className="flex gap-0.5">
                    {taskIds.map((t) => {
                      const r = s.perTask[t];
                      const level = !r ? "bg-surface-3" : r.ok === r.n ? "bg-good" : r.ok === 0 ? "bg-critical" : "bg-warning";
                      return <span key={t} title={`${t}: ${r ? `${r.ok}/${r.n}` : "não rodou"}`} className={`h-3.5 w-2.5 rounded-sm ${level}`} />;
                    })}
                  </div>
                </td>
                <td className="tnum">{num(s.genTokS)}</td>
                <td className="tnum">{s.ttftMs != null ? seconds(s.ttftMs / 1000) : "—"}</td>
                <td className="tnum">{s.loadMs != null ? seconds(s.loadMs / 1000) : "—"}</td>
                <td className="tnum">{s.memGB != null ? `${num(s.memGB, 1)} GB` : "—"}</td>
                <td>
                  <ApplyTier model={s.model} tiers={d.tiers} />
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhum benchmark ainda. Rode um abaixo.</Empty>
        )}
        <p className="border-t border-line-soft px-4 py-2 text-[12px] text-ink-3">
          Por tarefa: verde passou em todas as amostras, âmbar em parte, vermelho em nenhuma, cinza não rodou.
        </p>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <NewRun data={d} />
        <WeightsPanel key={JSON.stringify(d.weights)} weights={d.weights} />
      </div>

      <Panel title="Execuções" className="mt-5" pad={false}>
        {d.runs.length ? (
          <Table head={["#", "Criado", "Tipo", "Modelos", "Progresso", "Situação", ""]}>
            {d.runs.map((r) => (
              <tr key={r.id}>
                <td className="tnum text-ink-3">{r.id}</td>
                <td className="tnum whitespace-nowrap text-ink-2">{dateTime(r.createdAt)}</td>
                <td>{r.kind === "quality" ? "qualidade" : "performance"}</td>
                <td className="max-w-[32ch] text-[12.5px]">{r.models.join(", ")}</td>
                <td className="w-48">
                  <div className="tnum mb-1 text-[12px] text-ink-2">
                    {r.done}/{r.total || "?"} {r.current && <span className="text-ink-3">· {r.current}</span>}
                  </div>
                  <Meter value={r.done} max={r.total || 1} label={`Progresso do benchmark ${r.id}`} />
                </td>
                <td>
                  <Status
                    level={r.status === "done" ? "good" : r.status === "failed" ? "critical" : r.status === "running" ? "info" : "info"}
                    label={{ queued: "na fila", running: "rodando", done: "concluído", failed: "falhou", cancelled: "cancelado" }[r.status]}
                  />
                  {r.error && <div className="max-w-[30ch] text-[12px] text-critical">{r.error}</div>}
                </td>
                <td>{(r.status === "queued" || r.status === "running") && <Button onClick={() => cancel(r.id)}>Cancelar</Button>}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma execução.</Empty>
        )}
      </Panel>

      <Panel title="Tarefas da suíte de qualidade" className="mt-5" pad={false}>
        {d.tasks.length ? (
          <Table head={["Tarefa", "O que mede", "Contexto"]} dense>
            {d.tasks.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap font-medium">{t.title}</td>
                <td className="max-w-[70ch] text-ink-2">{t.description}</td>
                <td className="tnum text-ink-2">{t.context.length} arquivo(s)</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma tarefa em bench/tasks.</Empty>
        )}
      </Panel>
    </>
  );
}

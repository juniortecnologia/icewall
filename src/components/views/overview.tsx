"use client";
import Link from "next/link";
import type { overview } from "@/server/queries";
import { useLive, send } from "@/lib/api";
import { ago, bytes, compact, gb, num, pct, seconds, stateLabel } from "@/lib/format";
import type { HealthSnapshot, OllamaLoaded } from "@/lib/types";
import { SERIES } from "../charts";
import { Button, Code, Empty, ErrorNote, Jev, Loading, PageHeader, Panel, Readout, Status, severityLevel, type Level } from "../ui";
import { RecommendationApplyButton } from "../recommendation-apply-button";
import { useQueryClient } from "@tanstack/react-query";

type Overview = ReturnType<typeof overview>;

const tempLevel = (t: number | null | undefined): Level => (t == null ? "info" : t >= 85 ? "critical" : t >= 75 ? "warning" : "good");

/** A parede: memória unificada do GB10, por consumidor (medido pelo nvidia-smi + /proc/meminfo). */
function MemoryWall({ h, loaded }: { h: HealthSnapshot; loaded: OllamaLoaded[] }) {
  const used = h.memTotal - h.memAvailable;
  const ollama = h.ollamaVram;
  const otherGpu = h.apps.filter((a) => !/ollama|llama/i.test(a.name)).reduce((s, a) => s + (a.usedMiB ?? 0) * 1048576, 0);
  const otherNames = h.apps.filter((a) => !/ollama|llama/i.test(a.name)).map((a) => a.name);
  const rest = Math.max(0, used - ollama - otherGpu);
  const segs = [
    { key: "ollama", label: loaded.length ? `Ollama: ${loaded.map((m) => m.name).join(", ")}` : "Ollama", value: ollama, color: SERIES[0], dim: false },
    { key: "gpu", label: `Outros processos na GPU${otherNames.length ? ` (${otherNames.join(", ")})` : ""}`, value: otherGpu, color: SERIES[1], dim: false },
    { key: "rest", label: "Sistema e demais processos", value: rest, color: "var(--ink-3)", dim: true },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] text-ink-3">Memória unificada (CPU + GPU)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="readout text-[44px] font-medium leading-none text-ink">{gb(used)}</span>
            <span className="readout text-[20px] text-ink-3">/ {gb(h.memTotal)} GB</span>
          </div>
        </div>
        <div className="text-right text-[13px] text-ink-2">
          <div>
            <span className="tnum text-ink">{gb(h.memAvailable)} GB</span> livres para carregar modelos
          </div>
          <div className="text-ink-3">
            swap em uso: <span className="tnum">{bytes(h.swapTotal - h.swapFree)}</span>
          </div>
        </div>
      </div>
      <div
        className="mt-4 flex h-9 w-full gap-[2px] overflow-hidden rounded-md bg-surface-3"
        role="img"
        aria-label={`Memória: ${gb(used)} de ${gb(h.memTotal)} GB em uso`}
      >
        {segs
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              title={`${s.label}: ${bytes(s.value)}`}
              className="h-full"
              style={{ width: `${(s.value / h.memTotal) * 100}%`, background: s.color, opacity: s.dim ? 0.55 : 1 }}
            />
          ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color, opacity: s.dim ? 0.55 : 1 }} />
            <span className="text-ink-2">{s.label}</span>
            <span className="tnum text-ink">{bytes(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OverviewView() {
  const q = useLive<Overview>("/api/overview", 5000);
  const qc = useQueryClient();
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>Não consegui ler o estado do painel: {String(q.error?.message)}</ErrorNote>;
  const d = q.data;
  const h = d.health?.data;
  const sparkDown = Boolean(d.health?.error);
  const dismiss = async (id: number) => {
    await send(`/api/recommendations/${id}`, "PATCH", { status: "dismissed" });
    void qc.invalidateQueries();
  };

  return (
    <>
      <PageHeader
        title="DGX Spark"
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {sparkDown ? (
              <Status level="critical" label={`inacessível: ${d.health?.error}`} />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-good">
                <span className="live-dot h-2 w-2 rounded-full bg-good" aria-hidden /> ao vivo
              </span>
            )}
            <span className="text-ink-3">atualizado {ago(d.health?.ts)}</span>
            <span className="text-ink-3">Ollama {d.ollama?.version ?? "?"}</span>
          </span>
        }
      />

      {h ? (
        <section className="mb-6 rounded-lg border border-line-soft bg-surface p-5">
          <MemoryWall h={h} loaded={d.ollama?.loaded ?? []} />
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line-soft pt-5 sm:grid-cols-3 lg:grid-cols-6">
            <Readout label="Temperatura GPU" value={num(h.gpu?.temp)} unit="°C" level={tempLevel(h.gpu?.temp)} />
            <Readout label="Uso da GPU" value={num(h.gpu?.util)} unit="%" />
            <Readout label="Potência GPU" value={num(h.gpu?.power, 1)} unit="W" sub={h.gpu?.clock ? `${num(h.gpu.clock)} MHz` : undefined} />
            <Readout label="Carga da CPU" value={num(h.load1, 2)} sub={`${h.cpuCount} núcleos · 15 min ${num(h.load15, 2)}`} />
            <Readout label="Disco /" value={h.diskTotal ? pct((h.diskUsed ?? 0) / h.diskTotal) : "—"} sub={`${bytes(h.diskUsed)} de ${bytes(h.diskTotal)}`} />
            <Readout label="Processos na GPU" value={h.apps.length} sub={h.apps.map((a) => a.name).join(", ") || "nenhum"} />
          </div>
        </section>
      ) : (
        <ErrorNote>Sem leitura do Spark ainda. Confira `ssh spark` nesta máquina.</ErrorNote>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel voice="aurora" title="Auditor: o que fazer agora" aside={d.jev.enabled ? `Jev ${d.jev.model}` : "Jev desligada (sem TYPESAFE_API_KEY)"} pad={false}>
          {d.recommendations.length ? (
            <ul className="divide-y divide-line-soft">
              {d.recommendations.slice(0, 8).map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Status level={severityLevel(r.severity)} label="" />
                        <span className="font-medium text-ink">{r.title}</span>
                        {r.confidence != null && <Jev label="Jev" p={r.confidence} title="Confiança/probabilidade do julgamento" />}
                      </div>
                      <p className="mt-1 max-w-[75ch] text-[13px] text-ink-2">{r.detail}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RecommendationApplyButton id={r.id} action={r.action} />
                      <Button onClick={() => dismiss(r.id)}>Dispensar</Button>
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
            <Empty>Nada pendente. O auditor revisa a cada 5 minutos.</Empty>
          )}
          {d.recommendations.length > 8 && (
            <div className="border-t border-line-soft px-4 py-2 text-[12.5px]">
              <Link className="text-aurora hover:underline" href="/auditor">
                Ver as {d.recommendations.length} recomendações
              </Link>
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Modelos carregados" aside={<Link href="/models" className="hover:text-ink">{d.ollama?.models ?? 0} instalados</Link>}>
            {d.ollama?.loaded.length ? (
              <ul className="space-y-2 text-[13px]">
                {d.ollama.loaded.map((m) => (
                  <li key={m.name} className="flex justify-between gap-3">
                    <span className="truncate">{m.name}</span>
                    <span className="tnum text-ink-2">{bytes(m.sizeVram)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">Nenhum na memória. O Ollama carrega sob demanda.</p>
            )}
          </Panel>

          <Panel title="Delegações nos últimos 7 dias" aside={<Link href="/delegations" className="hover:text-ink">detalhes</Link>}>
            <div className="grid grid-cols-3 gap-4">
              <Readout label="Execuções" value={d.delegations.total} />
              <Readout label="Aproveitadas" value={d.delegations.total ? pct(d.delegations.ok / d.delegations.total) : "—"} />
              <Readout label="Tokens locais" value={compact(d.delegations.localTokens)} />
            </div>
          </Panel>

          <Panel title="Containers" aside={<Link href="/containers" className="hover:text-ink">{d.docker?.running ?? 0} de {d.docker?.total ?? 0} rodando</Link>}>
            <ul className="space-y-1.5 text-[13px]">
              {(d.docker?.containers ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{c.name}</span>
                  <Status level={c.state === "running" ? "good" : "info"} label={stateLabel(c.state)} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Eventos" pad={false}>
          {d.events.length ? (
            <ol className="divide-y divide-line-soft">
              {d.events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2 text-[13px]">
                  <span className="tnum w-20 shrink-0 text-ink-3">{ago(e.ts)}</span>
                  <Status level={severityLevel(e.severity)} label="" />
                  <span className="min-w-0 text-ink">{e.title}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Nenhuma mudança detectada ainda. Modelos, containers, portas e updates novos aparecem aqui.</Empty>
          )}
        </Panel>
        <Panel title="Coletores">
          <ul className="space-y-1.5 text-[12.5px]">
            {d.jobs.map((j) => (
              <li key={j.name} className="flex items-center justify-between gap-3">
                <span className="truncate text-ink-2">{j.label}</span>
                {j.lastError ? (
                  <Status level="critical" label="erro" />
                ) : (
                  <span className="tnum shrink-0 text-ink-3">
                    {j.running ? "rodando" : `${ago(j.lastRun)} · ${seconds((j.lastMs ?? 0) / 1000)}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

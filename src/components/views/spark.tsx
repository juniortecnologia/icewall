"use client";
import { useState } from "react";
import type { metricSeries, overview } from "@/server/queries";
import { useLive } from "@/lib/api";
import { bytes, gb, num } from "@/lib/format";
import { TimeChart } from "../charts";
import { Empty, ErrorNote, Loading, PageHeader, Panel, Segmented, Table } from "../ui";

type Series = ReturnType<typeof metricSeries>;
type Overview = ReturnType<typeof overview>;
type Range = "1h" | "6h" | "24h" | "7d";

export function SparkView() {
  const [range, setRange] = useState<Range>("6h");
  const q = useLive<Series>(`/api/metrics?range=${range}`, 15_000);
  const o = useLive<Overview>("/api/overview", 15_000);
  const data = (q.data ?? []).map((r) => ({
    ...r,
    memUsedGB: r.memUsed / 1e9,
    vramGB: (r.ollamaVram ?? 0) / 1e9,
    swapGB: (r.swapUsed ?? 0) / 1e9,
  }));
  const memMax = Math.ceil((data[0]?.memTotal ?? 130e9) / 1e9);
  const h = o.data?.health?.data;

  return (
    <>
      <PageHeader
        title="Spark"
        sub="Séries de saúde coletadas a cada 15 s por SSH. Depois de 7 dias fica uma amostra por hora."
        right={
          <Segmented
            label="Período"
            value={range}
            onChange={setRange}
            options={[
              { value: "1h", label: "1 h" },
              { value: "6h", label: "6 h" },
              { value: "24h", label: "24 h" },
              { value: "7d", label: "7 dias" },
            ]}
          />
        }
      />
      {q.error && <ErrorNote>{q.error.message}</ErrorNote>}
      {q.isLoading ? (
        <Loading />
      ) : data.length < 2 ? (
        <Empty>Ainda coletando. Os gráficos aparecem depois de algumas leituras.</Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Uso da GPU (%)">
            <TimeChart data={data} dataKey="gpuUtil" label="Uso da GPU" format={(v) => `${num(v)}%`} domain={[0, 100]} />
          </Panel>
          <Panel title="Temperatura da GPU (°C)">
            <TimeChart data={data} dataKey="gpuTemp" label="Temperatura" format={(v) => `${num(v)}°`} domain={[20, 100]} />
          </Panel>
          <Panel title="Memória unificada em uso (GB)">
            <TimeChart data={data} dataKey="memUsedGB" label="Memória em uso" format={(v) => `${num(v)} GB`} domain={[0, memMax]} />
          </Panel>
          <Panel title="Modelos do Ollama na memória (GB)">
            <TimeChart data={data} dataKey="vramGB" label="Modelos carregados" format={(v) => `${num(v)} GB`} domain={[0, "auto"]} />
          </Panel>
          <Panel title="Potência da GPU (W)">
            <TimeChart data={data} dataKey="gpuPower" label="Potência" format={(v) => `${num(v)} W`} domain={[0, "auto"]} />
          </Panel>
          <Panel title="Carga da CPU (média de 1 min)">
            <TimeChart data={data} dataKey="load1" label="Carga" format={(v) => num(v, 1)} domain={[0, "auto"]} />
          </Panel>
          <Panel title="Swap em uso (GB)">
            <TimeChart data={data} dataKey="swapGB" label="Swap" format={(v) => `${num(v, 1)} GB`} domain={[0, "auto"]} />
          </Panel>
          <Panel title="Processos usando a GPU agora">
            {h?.apps.length ? (
              <Table head={["PID", "Processo", "Memória"]} dense>
                {h.apps.map((a) => (
                  <tr key={a.pid}>
                    <td className="tnum text-ink-2">{a.pid}</td>
                    <td>{a.name}</td>
                    <td className="tnum">{a.usedMiB != null ? bytes(a.usedMiB * 1048576) : "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhum processo na GPU.</Empty>
            )}
            {h && (
              <p className="mt-3 text-[12px] text-ink-3">
                No GB10 a GPU usa a mesma RAM da CPU: {gb(h.memTotal - h.memAvailable)} GB de {gb(h.memTotal)} GB em uso agora.
              </p>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

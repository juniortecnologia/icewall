"use client";
import { useState } from "react";
import type { containers } from "@/server/queries";
import { useAction, useLive } from "@/lib/api";
import { ago, bytes, num, stateLabel } from "@/lib/format";
import { TimeChart } from "../charts";
import { ActionButton, Button, Code, Empty, ErrorNote, Loading, PageHeader, Panel, Status, Table } from "../ui";

type C = ReturnType<typeof containers>;

export function ContainersView() {
  const q = useLive<C>("/api/containers", 15_000);
  const logs = useAction();
  const [logsOf, setLogsOf] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const snap = q.data.docker;
  const d = snap?.data;
  const stats = new Map((d?.stats ?? []).map((s) => [s.name, s]));
  const running = (d?.containers ?? []).filter((c) => c.state === "running");

  return (
    <>
      <PageHeader title="Containers" sub={`Docker no Spark · atualizado ${ago(snap?.ts)}`} />
      {snap?.error && <ErrorNote>{snap.error}</ErrorNote>}
      <Panel title="Containers" pad={false}>
        {d?.containers.length ? (
          <Table head={["Nome", "Imagem", "Estado", "CPU", "Memória", "Portas", ""]}>
            {d.containers.map((c) => {
              const s = stats.get(c.name);
              return (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[12px] text-ink-3">{c.gpu ? "usa GPU · " : ""}criado {c.runningFor}</div>
                  </td>
                  <td className="max-w-[28ch] truncate text-[12.5px] text-ink-2" title={c.image}>
                    {c.image}
                  </td>
                  <td>
                    <Status level={c.state === "running" ? "good" : c.status.includes("(137)") ? "warning" : "info"} label={stateLabel(c.state)} />
                    <div className="text-[12px] text-ink-3">{c.status}</div>
                  </td>
                  <td className="tnum">{s?.cpuPct != null ? `${num(s.cpuPct, 1)}%` : "—"}</td>
                  <td className="tnum">{s?.memUsed != null ? bytes(s.memUsed) : "—"}</td>
                  <td className="max-w-[24ch] text-[12px] text-ink-2">{c.ports || "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {c.state === "running" ? (
                        <>
                          <ActionButton action="container.restart" target={c.name} label="Reiniciar" />
                          <ActionButton action="container.stop" target={c.name} label="Parar" danger />
                        </>
                      ) : (
                        <ActionButton action="container.start" target={c.name} label="Iniciar" />
                      )}
                      <Button
                        onClick={() => {
                          setLogsOf(c.name);
                          logs.mutate({ action: "container.logs", target: c.name });
                        }}
                      >
                        Logs
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Nenhum container.</Empty>
        )}
      </Panel>

      {logsOf && (
        <Panel title={`Logs: ${logsOf}`} className="mt-5" aside={<button className="hover:text-ink" onClick={() => setLogsOf(null)}>fechar</button>}>
          {logs.isPending ? <Loading label="Lendo logs" /> : <Code>{logs.data?.output || "(vazio)"}</Code>}
        </Panel>
      )}

      {running.length > 0 && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {running.map((c) => {
            const series = q.data.history.filter((h) => h.name === c.name).map((h) => ({ ts: h.ts, memGB: (h.memBytes ?? 0) / 1e9, cpu: h.cpuPct ?? 0 }));
            return (
              <Panel key={c.name} title={`${c.name}: memória nas últimas 6 h (GB)`}>
                {series.length > 1 ? <TimeChart data={series} dataKey="memGB" label="Memória" format={(v) => `${num(v, 1)} GB`} domain={[0, "auto"]} height={120} /> : <Empty>Coletando.</Empty>}
              </Panel>
            );
          })}
        </div>
      )}

      <Panel title="Imagens" className="mt-5" pad={false}>
        <Table head={["Imagem", "Tamanho", "Criada"]} dense>
          {(d?.images ?? []).map((i) => (
            <tr key={i.ref}>
              <td>{i.ref}</td>
              <td className="tnum">{i.size}</td>
              <td className="text-ink-2">{i.createdSince}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}

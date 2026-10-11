"use client";
import type { actionLog } from "@/server/queries";
import { useLive } from "@/lib/api";
import { dateTime, seconds } from "@/lib/format";
import { Empty, ErrorNote, Loading, PageHeader, Panel, Status, Table } from "../ui";

type L = ReturnType<typeof actionLog>;

export function ActionsView() {
  const q = useLive<L>("/api/actions", 10_000);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  return (
    <>
      <PageHeader title="Ações" sub="Tudo o que o painel alterou no Spark ou no models.json, com a saída de cada comando." />
      <Panel pad={false}>
        {q.data.length ? (
          <Table head={["Quando", "Ação", "Alvo", "Resultado", "Duração", "Saída"]}>
            {q.data.map((a) => (
              <tr key={a.id}>
                <td className="tnum whitespace-nowrap text-ink-2">{dateTime(a.ts)}</td>
                <td className="whitespace-nowrap">{a.action}</td>
                <td>{a.target}</td>
                <td>
                  <Status level={a.status === "ok" ? "good" : "critical"} label={a.status === "ok" ? "ok" : "erro"} />
                </td>
                <td className="tnum">{seconds((a.durationMs ?? 0) / 1000)}</td>
                <td className="max-w-[50ch]">
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] text-ink-2">{a.output}</pre>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma ação executada ainda.</Empty>
        )}
      </Panel>
    </>
  );
}

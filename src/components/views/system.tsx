"use client";
import type { system } from "@/server/queries";
import { useLive } from "@/lib/api";
import { ago, uptimeSince } from "@/lib/format";
import { Code, Empty, ErrorNote, Jev, yesNo, Kv, Loading, PageHeader, Panel, Status, Table, severityLevel } from "../ui";

type S = ReturnType<typeof system>;

const SEVERITY = ["cosmético", "correção de bug", "segurança local", "segurança exposta"];

export function SystemView() {
  const q = useLive<S>("/api/system", 30_000);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const { os, updates, security, ollamaVersion } = q.data;
  const o = os?.data;
  const u = updates?.data;
  const sec = security?.data;
  const pkgs = [...(u?.packages ?? [])].sort((a, b) => (b.jev?.severity ?? (b.security ? 2.5 : 1)) - (a.jev?.severity ?? (a.security ? 2.5 : 1)));

  return (
    <>
      <PageHeader title="Sistema" sub="Sistema operacional, runtimes, updates e segurança do Spark." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Sistema e runtimes" aside={os ? `lido ${ago(os.ts)}` : undefined}>
          {o ? (
            <Kv
              items={[
                ["Sistema", o.prettyName],
                ["Kernel", o.kernel],
                ["Ligado há", uptimeSince(o.bootedAt)],
                ["GPU", o.gpuName],
                ["Driver NVIDIA", o.driver],
                ["CUDA (driver)", o.cuda],
                ["CUDA toolkits", o.cudaToolkits.join(", ") || "—"],
                ["Docker", o.docker],
                ["Ollama", ollamaVersion],
                ["Python", o.python],
                ...Object.entries(o.packages).map(([k, v]) => [k, v] as [string, string]),
                ...o.vllm.map((v) => [`vLLM (${v.image})`, v.version || "?"] as [string, string]),
              ]}
            />
          ) : (
            <Empty>{os?.error ?? "Ainda não coletado."}</Empty>
          )}
        </Panel>

        <Panel title="Segurança" aside={security ? `lido ${ago(security.ts)}` : undefined}>
          {sec ? (
            <div className="space-y-4">
              <Kv
                items={[
                  ["Firewall (ufw)", <Status key="ufw" level={sec.ufwActive === "active" ? "good" : "critical"} label={sec.ufwActive} />],
                  ["Updates automáticos", <Status key="uu" level={sec.unattendedActive === "active" ? "good" : "warning"} label={sec.unattendedEnabled || sec.unattendedActive} />],
                  ["Falhas de login SSH (24 h)", `${sec.auth.count}${sec.auth.byIp.length ? ` de ${sec.auth.byIp.slice(0, 3).map((i) => `${i.ip} (${i.count})`).join(", ")}` : ""}`],
                  ["Serviços com falha", sec.failedUnits.length ? sec.failedUnits.map((f) => f.unit).join(", ") : "nenhum"],
                  [
                    "Login SSH por senha",
                    sec.passwordAuth == null ? (
                      "sonda sem resposta"
                    ) : (
                      <Status key="pwd" level={sec.passwordAuth ? "warning" : "good"} label={sec.passwordAuth ? "aceito" : "recusado"} />
                    ),
                  ],
                  ["sshd (arquivos)", Object.entries(sec.sshdConfig).map(([k, v]) => `${k} ${v}`).join(", ") || "padrões do OpenSSH"],
                ]}
              />
              <div>
                <h3 className="mb-1.5 text-[12px] text-ink-3">Portas escutando</h3>
                <Table head={["Porta", "Serviço", "Alcance", "Risco (Jev)"]} dense>
                  {sec.ports.map((p) => (
                    <tr key={p.port}>
                      <td className="tnum">{p.port}</td>
                      <td>{p.service ?? <span className="text-ink-3">desconhecido</span>}</td>
                      <td>
                        {p.scope === "any" ? <Status level="warning" label="toda a rede" /> : p.scope === "loopback" ? <span className="text-ink-2">só local</span> : <span className="text-ink-2">{p.addresses.join(", ")}</span>}
                      </td>
                      <td>{p.jevRisk != null ? <Jev label={yesNo(p.jevRisk, "arriscado", "aceitável")} p={p.jevRisk} /> : <span className="text-ink-3">—</span>}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </div>
          ) : (
            <Empty>{security?.error ?? "Ainda não coletado."}</Empty>
          )}
        </Panel>
      </div>

      {sec && sec.findings.length > 0 && (
        <Panel title="Achados" className="mt-5" pad={false}>
          <ul className="divide-y divide-line-soft">
            {sec.findings.map((f) => (
              <li key={f.key} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Status level={severityLevel(f.severity)} label="" />
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">{f.detail}</p>
                {f.fix && (
                  <div className="mt-2">
                    <Code>{f.fix}</Code>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Updates pendentes"
        className="mt-5"
        aside={
          u
            ? `${u.packages.length} pacotes · listas do apt de ${u.listsUpdatedAt ? ago(u.listsUpdatedAt) : "?"}${u.rebootRequired ? " · reboot pendente" : ""}`
            : undefined
        }
        pad={false}
      >
        {pkgs.length ? (
          <Table head={["Pacote", "De", "Para", "Origem", "Gravidade (Jev)", "Pilha da GPU", "Pede restart"]} dense>
            {pkgs.map((p) => (
              <tr key={p.name}>
                <td className="font-medium">{p.name}</td>
                <td className="text-[12px] text-ink-3">{p.from}</td>
                <td className="text-[12px] text-ink-2">{p.version}</td>
                <td>{p.security ? <Status level="warning" label="segurança" /> : <span className="text-[12px] text-ink-3">updates</span>}</td>
                <td>{p.jev?.severity != null ? <Jev label={SEVERITY[Math.round(p.jev.severity)]} p={p.jev.severityConfidence} title={`score ${p.jev.severity.toFixed(2)} de 3`} /> : <span className="text-ink-3">—</span>}</td>
                <td>{p.jev?.gpu != null ? <Jev label={yesNo(p.jev.gpu)} p={p.jev.gpu} /> : <span className="text-ink-3">—</span>}</td>
                <td>{p.jev?.restart != null ? <Jev label={yesNo(p.jev.restart)} p={p.jev.restart} /> : <span className="text-ink-3">—</span>}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>{updates?.error ?? "Tudo atualizado."}</Empty>
        )}
        <p className="border-t border-line-soft px-4 py-2 text-[12px] text-ink-3">
          O painel não roda apt (o usuário facini não tem sudo sem senha). Os comandos sugeridos ficam no Auditor.
        </p>
      </Panel>
    </>
  );
}

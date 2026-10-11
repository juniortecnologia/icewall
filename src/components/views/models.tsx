"use client";
import { useState } from "react";
import type { models } from "@/server/queries";
import { useAction, useLive } from "@/lib/api";
import { ago, bytes, compact, num, pct } from "@/lib/format";
import { ActionButton, Button, Empty, ErrorNote, Loading, PageHeader, Panel, Status, Table } from "../ui";

type Models = ReturnType<typeof models>;

export function ModelsView() {
  const q = useLive<Models>("/api/models", 10_000);
  const pull = useAction();
  const [name, setName] = useState("");
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;
  const { ollama, tiers, keepAlive, usage, board } = q.data;
  const loaded = new Map((ollama?.data?.loaded ?? []).map((m) => [m.name, m]));
  const use = new Map(usage.map((u) => [u.model, u]));
  const score = new Map(board.map((b) => [b.model, b]));
  const tierOf = (m: string) => tiers.filter((t) => t.model === m).map((t) => t.name);
  const fallbackOf = (m: string) => tiers.filter((t) => t.fallback.includes(m)).map((t) => t.name);

  return (
    <>
      <PageHeader
        title="Modelos"
        sub={
          <>
            Ollama {ollama?.data?.version} em {ollama?.data?.url} · atualizado {ago(ollama?.ts)}. Os níveis vêm do models.json da skill
            delegate-local (keep_alive {keepAlive ?? "?"}).
          </>
        }
      />
      {ollama?.error && <ErrorNote>Ollama inacessível: {ollama.error}</ErrorNote>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {tiers.map((t) => (
          <Panel key={t.name} title={`Nível ${t.name}`}>
            <div className="wide text-[17px] font-medium">{t.model}</div>
            <div className="mt-1 text-[12px] text-ink-3">fallback: {t.fallback.join(", ") || "nenhum"}</div>
          </Panel>
        ))}
      </div>

      <Panel title="Instalados no Spark" aside={`${ollama?.data?.models.length ?? 0} modelos`} pad={false}>
        <Table head={["Modelo", "Parâmetros", "Quant.", "Tamanho", "Contexto", "Recursos", "Delegações", "Score bench", "Estado", ""]}>
          {(ollama?.data?.models ?? []).map((m) => {
            const l = loaded.get(m.name);
            const u = use.get(m.name);
            const s = score.get(m.name);
            const roles = tierOf(m.name);
            return (
              <tr key={m.name}>
                <td>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-[12px] text-ink-3">
                    {roles.length ? `nível ${roles.join(", ")}` : fallbackOf(m.name).length ? `fallback de ${fallbackOf(m.name).join(", ")}` : m.family}
                  </div>
                </td>
                <td className="tnum">{m.parameterSize ?? "—"}</td>
                <td className="text-ink-2">{m.quantization ?? "—"}</td>
                <td className="tnum">{bytes(m.size)}</td>
                <td className="tnum">{m.contextLength ? compact(m.contextLength) : "—"}</td>
                <td className="text-[12px] text-ink-2">{m.capabilities.join(", ")}</td>
                <td className="tnum">
                  {u ? (
                    <>
                      {u.n} <span className="text-ink-3">· {pct(u.ok / u.n)} ok · {num(u.tokS)} tok/s</span>
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="tnum">{s ? s.score.toFixed(2) : <span className="text-ink-3">—</span>}</td>
                <td>{l ? <Status level="good" label={`carregado · ${bytes(l.sizeVram)}`} /> : <span className="text-[12px] text-ink-3">em disco</span>}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {l ? (
                      <ActionButton action="model.unload" target={m.name} label="Descarregar" needsConfirm={false} />
                    ) : (
                      m.capabilities.includes("completion") && <ActionButton action="model.load" target={m.name} label="Carregar" needsConfirm={false} />
                    )}
                    <ActionButton action="model.pull" target={m.name} label="Atualizar" confirm={`Baixar a versão mais nova de ${m.name}?`} />
                    {!roles.length && (
                      <ActionButton action="model.delete" target={m.name} label="Remover" danger confirm={`Apagar ${m.name} do Spark (${bytes(m.size)})?`} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
        {!ollama?.data?.models.length && <Empty>Nenhum modelo listado.</Empty>}
      </Panel>

      <Panel title="Baixar modelo novo" className="mt-5">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) pull.mutate({ action: "model.pull", target: name.trim() });
          }}
        >
          <label htmlFor="pull" className="text-[13px] text-ink-2">
            Nome no registro do Ollama
          </label>
          <input
            id="pull"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: qwen3.6:35b-a3b"
            className="w-72 rounded-md border border-line bg-bg px-2.5 py-1 text-[13px] text-ink placeholder:text-ink-3"
          />
          <Button type="submit" tone="primary" disabled={pull.isPending || !name.trim()}>
            {pull.isPending ? "Baixando…" : "Baixar"}
          </Button>
          {pull.data && <span className={`text-[12.5px] ${pull.data.ok ? "text-good" : "text-critical"}`}>{pull.data.output}</span>}
        </form>
        <p className="mt-2 text-[12px] text-ink-3">O download roda no Spark e pode levar vários minutos; a lista atualiza sozinha ao terminar.</p>
      </Panel>
    </>
  );
}

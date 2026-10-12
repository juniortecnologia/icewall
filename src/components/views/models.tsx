"use client";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { models } from "@/server/queries";
import { useAction, useLive } from "@/lib/api";
import { ago, bytes, compact, num, pct } from "@/lib/format";
import { Button, Empty, ErrorNote, Loading, PageHeader, Panel, Readout, Status } from "../ui";

type Models = ReturnType<typeof models>;

function ModelActionButton({
  action,
  target,
  arg,
  label,
  confirm,
  danger = false,
  disabled,
  onRun,
}: {
  action: string;
  target: string;
  arg?: string;
  label: string;
  confirm: string;
  danger?: boolean;
  disabled: boolean;
  onRun: (action: string, target: string, label: string, arg?: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const run = () => {
    setAsking(false);
    onRun(action, target, label, arg);
  };

  return asking ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] text-ink-2">{confirm}</span>
      <Button tone={danger ? "danger" : "primary"} disabled={disabled} onClick={run}>
        Confirmar
      </Button>
      <Button disabled={disabled} onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </div>
  ) : (
    <Button tone={danger ? "danger" : "default"} disabled={disabled} onClick={() => setAsking(true)}>
      {label}
    </Button>
  );
}

function ModelSourceEditor({
  model,
  source,
  disabled,
  onSave,
}: {
  model: string;
  source: string | undefined;
  disabled: boolean;
  onSave: (model: string, source: string) => void;
}) {
  const [value, setValue] = useState(source ?? "");
  const unchanged = value.trim() === (source ?? "");

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(model, value.trim());
      }}
    >
      <label className="grid gap-1 text-[12px] text-ink-2">
        <span>Tag de origem para recriar esta variante</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="ex.: qwen3.8:27b"
          maxLength={200}
          pattern="[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,200}"
          title="Use o nome e a tag publicados no Ollama"
          className="w-full max-w-md rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3"
        />
      </label>
      <Button type="submit" disabled={disabled || unchanged}>
        {source && !value.trim() ? "Remover origem" : source ? "Salvar origem" : "Registrar origem"}
      </Button>
    </form>
  );
}

export function ModelsView() {
  const q = useLive<Models>("/api/models", 10_000);
  const action = useAction();
  const [name, setName] = useState("");
  const [actionInfo, setActionInfo] = useState<{ label: string; target: string } | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote>{String(q.error?.message)}</ErrorNote>;

  const { ollama, tiers, keepAlive, usage, board, modelSources } = q.data;
  const models = ollama?.data?.models ?? [];
  const loaded = new Map((ollama?.data?.loaded ?? []).map((m) => [m.name, m]));
  const useByModel = new Map(usage.map((u) => [u.model, u]));
  const score = new Map(board.map((b) => [b.model, b]));
  const tierOf = (model: string) => tiers.filter((tier) => tier.model === model).map((tier) => tier.name);
  const fallbackOf = (model: string) => tiers.filter((tier) => tier.fallback.includes(model)).map((tier) => tier.name);

  const runAction = (id: string, target: string, label: string, arg?: string) => {
    if (action.isPending) return;
    action.reset();
    setActionInfo({ label, target });
    action.mutate({ action: id, target, arg });
  };

  return (
    <>
      <PageHeader
        title="Modelos"
        sub={
          <>
            Ollama {ollama?.data?.version ?? "—"} em {ollama?.data?.url ?? "—"} · sincronizado {ago(ollama?.ts)}.
          </>
        }
        right={
          <Button disabled={q.isFetching} onClick={() => void q.refetch()}>
            <RefreshCw size={13} className={q.isFetching ? "animate-spin" : ""} aria-hidden />
            {q.isFetching ? "Atualizando lista…" : "Atualizar lista"}
          </Button>
        }
      />

      {ollama?.error && <ErrorNote>Ollama inacessível: {ollama.error}</ErrorNote>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Panel>
          <Readout label="Modelos instalados" value={models.length} />
        </Panel>
        <Panel>
          <Readout label="Carregados na memória" value={loaded.size} />
        </Panel>
        <Panel>
          <Readout label="Níveis configurados" value={tiers.length} />
        </Panel>
      </div>

      {actionInfo && action.isPending && (
        <div className="mb-4 rounded-md border border-line-soft bg-surface px-3 py-2 text-[13px]" role="status" aria-live="polite">
          <Status level="info" label={`${actionInfo.label}: ${actionInfo.target} · o Ollama pode levar alguns minutos`} />
        </div>
      )}
      {actionInfo && action.data && (
        action.data.ok ? (
          <div className="mb-4 rounded-md border border-good/30 bg-good/5 px-3 py-2 text-[13px]" role="status" aria-live="polite">
            <Status level="good" label={`${actionInfo.label}: ${actionInfo.target} · ${action.data.output}`} />
          </div>
        ) : (
          <div className="mb-4">
            <ErrorNote>
              {actionInfo.label} — {actionInfo.target}: {action.data.output}
            </ErrorNote>
          </div>
        )
      )}
      {actionInfo && action.error && (
        <div className="mb-4">
          <ErrorNote>
            {actionInfo.label} — {actionInfo.target}: {action.error.message}
          </ErrorNote>
        </div>
      )}

      <Panel title="Modelos instalados" aside={`${models.length} no Spark`} pad={false}>
        {models.length ? (
          <div className="divide-y divide-line-soft/60">
            {models.map((model) => {
              const loadedModel = loaded.get(model.name);
              const modelUsage = useByModel.get(model.name);
              const modelScore = score.get(model.name);
              const roles = tierOf(model.name);
              const fallbacks = fallbackOf(model.name);
              const source = modelSources[model.name];

              return (
                <article key={model.name} className="grid gap-x-5 gap-y-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="wide break-all text-[15px] font-medium">{model.name}</h3>
                      {roles.map((role) => (
                        <span key={role} className="rounded border border-ice-dim/50 bg-ice/5 px-1.5 py-0.5 text-[11px] text-ice">
                          Nível {role}
                        </span>
                      ))}
                      {fallbacks.map((role) => (
                        <span key={role} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                          fallback de {role}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[12px] text-ink-2">
                      {model.parameterSize ?? "Parâmetros —"} · {model.quantization ?? "quantização —"} · {bytes(model.size)}
                    </p>
                    <p className="mt-1 text-[12px] text-ink-3">
                      {modelUsage
                        ? `${modelUsage.n} delegações · ${pct(modelUsage.ok / modelUsage.n)} aproveitadas · ${num(modelUsage.tokS)} tok/s`
                        : "Sem delegações registradas"}
                      {modelScore && ` · score bench ${modelScore.score.toFixed(2)}`}
                    </p>
                    {source && <p className="mt-1 text-[12px] text-ice">Origem: {source} · atualizará e recriará esta variante</p>}
                  </div>

                  <div className="flex min-w-0 flex-col items-start gap-2 lg:items-end">
                    {loadedModel ? (
                      <Status level="good" label={`Na memória · ${bytes(loadedModel.sizeVram)}`} />
                    ) : (
                      <Status level="info" label="No disco" />
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {loadedModel ? (
                        <ModelActionButton
                          action="model.unload"
                          target={model.name}
                          label="Descarregar"
                          confirm={`Descarregar ${model.name}?`}
                          disabled={action.isPending}
                          onRun={runAction}
                        />
                      ) : (
                        model.capabilities.includes("completion") && (
                          <ModelActionButton
                            action="model.load"
                            target={model.name}
                            label="Carregar"
                            confirm={`Carregar ${model.name} na memória?`}
                            disabled={action.isPending}
                            onRun={runAction}
                          />
                        )
                      )}
                      <ModelActionButton
                        action="model.pull"
                        target={model.name}
                        label={source ? "Atualizar e recriar" : "Atualizar versão"}
                        confirm={
                          source
                            ? `Baixar a versão atual de ${source} e recriar ${model.name} preservando suas configurações?`
                            : `Buscar uma versão publicada de ${model.name} no registro do Ollama?`
                        }
                        disabled={action.isPending}
                        onRun={runAction}
                      />
                      {!roles.length && (
                        <ModelActionButton
                          action="model.delete"
                          target={model.name}
                          label="Remover"
                          confirm={`Apagar ${model.name} do Spark (${bytes(model.size)})?`}
                          danger
                          disabled={action.isPending}
                          onRun={runAction}
                        />
                      )}
                    </div>
                  </div>

                  <details className="text-[12px] lg:col-span-2">
                    <summary className="w-fit cursor-pointer text-ink-3 hover:text-ink-2">Detalhes técnicos</summary>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                      <div><dt className="inline text-ink-3">Família: </dt><dd className="inline">{model.family ?? "—"}</dd></div>
                      <div><dt className="inline text-ink-3">Contexto: </dt><dd className="inline">{model.contextLength ? compact(model.contextLength) : "—"}</dd></div>
                      <div><dt className="inline text-ink-3">Última modificação: </dt><dd className="inline">{ago(Date.parse(model.modifiedAt))}</dd></div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <dt className="inline text-ink-3">Recursos: </dt>
                        <dd className="inline">{model.capabilities.join(", ") || "—"}</dd>
                      </div>
                    </dl>
                    <ModelSourceEditor
                      key={`${model.name}:${source ?? ""}`}
                      model={model.name}
                      source={source}
                      disabled={action.isPending}
                      onSave={(target, origin) => runAction("model.source.set", target, "Configurar origem", origin)}
                    />
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty>Nenhum modelo instalado no Ollama.</Empty>
        )}
      </Panel>

      <Panel title="Baixar modelo do registro do Ollama" className="mt-5">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const target = name.trim();
            if (target) runAction("model.pull", target, "Baixar modelo");
          }}
        >
          <label htmlFor="pull" className="w-full text-[13px] text-ink-2">
            Nome e tag publicados (ex.: qwen3.6:35b-a3b)
          </label>
          <input
            id="pull"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="nome-do-modelo:tag"
            className="w-full max-w-md rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3"
          />
          <Button type="submit" tone="primary" disabled={action.isPending || !name.trim()}>
            {action.isPending && <RefreshCw size={12} className="animate-spin" aria-hidden />}
            Baixar
          </Button>
        </form>
        <p className="mt-2 max-w-[80ch] text-[12px] text-ink-3">
          Atualizações e downloads só funcionam para nomes publicados no registro configurado do Ollama. Variantes criadas localmente precisam ser refeitas a partir da tag original; o erro do registro aparecerá aqui.
        </p>
      </Panel>

      <details className="mt-5 rounded-lg border border-line-soft bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-ink hover:bg-surface-2">
          Configuração dos níveis de uso
        </summary>
        <div className="grid gap-3 border-t border-line-soft p-4 sm:grid-cols-3">
          {tiers.map((tier) => (
            <div key={tier.name} className="min-w-0">
              <div className="text-[12px] text-ink-3">Nível {tier.name}</div>
              <div className="mt-0.5 break-all text-[14px] font-medium">{tier.model}</div>
              <div className="mt-1 text-[12px] text-ink-3">
                {tier.backend === "ollama" ? `Fallback: ${tier.fallback.join(", ") || "nenhum"}` : `Backend: ${tier.backend}`}
              </div>
            </div>
          ))}
          <p className="text-[12px] text-ink-3 sm:col-span-3">Keep alive: {keepAlive ?? "—"}</p>
        </div>
      </details>
    </>
  );
}

"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getJson, send, sendForm, useLive } from "@/lib/api";
import { bytes, dateTime, num } from "@/lib/format";
import { Button, Code, Empty, ErrorNote, Kv, Loading, Meter, PageHeader, Panel, Segmented, Status, Table } from "../ui";
import type { SafeServer } from "@/app/api/train/servers/schemas";
import type { SafeTrainDataset } from "@/app/api/train/datasets/schemas";
import type { SafeTrainJob } from "@/app/api/train/jobs/schemas";
import type { SafeTrainArtifact } from "@/app/api/train/artifacts/schemas";

interface UploadOk {
  ok: true;
  dataset: SafeTrainDataset;
  validacao: { total: number; duplicados: number; vazios: number };
}

interface PreviewDataset {
  nome: string;
  remotePath: string;
  samples: number | null;
  amostras: unknown[];
}

interface LogPayload {
  job: SafeTrainJob;
  log: string;
  marcadores?: unknown[];
}

const PARAMS_DEFAULT = { learningRate: 0.0002, epochs: 3, r: 16, alpha: 16, dropout: 0, batchSize: 2, gradientAccumulationSteps: 4, maxSeqLength: 2048 };

/**
 * Aba Treinar (Fase 2). T1: datasets (upload/conversão/preview). T2: treinos
 * (stepper → fila com loss ao vivo, logs SSE e stop). Ambientes lab|produção.
 */
export function TrainView() {
  const qc = useQueryClient();

  // Servidores do registro (Station, Spark…): o treino vive no registro, não nos clusters.
  const servers = useLive<{ ok: boolean; servers: SafeServer[] }>("/api/train/servers", 30_000);
  const [serverId, setServerId] = useState<number | null>(null);
  const atual = serverId ?? servers.data?.servers[0]?.id ?? null;

  const datasets = useLive<{ ok: boolean; datasets: SafeTrainDataset[] }>(
    atual ? `/api/train/datasets?serverId=${atual}` : "/api/train/datasets",
    5000,
  );
  const jobs = useLive<{ ok: boolean; jobs: SafeTrainJob[] }>(
    atual ? `/api/train/jobs?serverId=${atual}` : "/api/train/jobs",
    5000,
  );
  const artifacts = useLive<{ ok: boolean; artifacts: SafeTrainArtifact[] }>(
    atual ? `/api/train/artifacts?serverId=${atual}` : "/api/train/artifacts",
    5000,
  );

  // ── datasets: upload / preview / remoção ────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [formatoTreino, setFormatoTreino] = useState<"chat" | "text">("chat");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<UploadOk | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const [preview, setPreview] = useState<PreviewDataset | null>(null);
  const [previewErro, setPreviewErro] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function enviar() {
    if (!file || !atual) return;
    setEnviando(true);
    setErro(null);
    setResultado(null);
    try {
      const form = new FormData();
      form.set("arquivo", file);
      form.set("serverId", String(atual));
      form.set("formatoTreino", formatoTreino);
      const data = await sendForm<UploadOk>("/api/train/datasets", form);
      setResultado(data);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      void qc.invalidateQueries();
    } catch (e) {
      setErro(String((e as Error).message));
    } finally {
      setEnviando(false);
    }
  }

  async function abrirPreview(d: SafeTrainDataset) {
    setPreviewLoading(true);
    setPreviewErro(null);
    setPreview(null);
    try {
      setPreview(await getJson<PreviewDataset>(`/api/train/datasets/${d.id}/preview`));
    } catch (e) {
      setPreviewErro(String((e as Error).message));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function excluirDataset(d: SafeTrainDataset) {
    if (!window.confirm(`Remover o dataset "${d.nome}"? O arquivo remoto também é apagado.`)) return;
    setErro(null);
    try {
      await send(`/api/train/datasets/${d.id}`, "DELETE");
      if (preview?.nome === d.nome) setPreview(null);
      void qc.invalidateQueries();
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  // ── treinos: novo job / lista / detalhe ao vivo ─────────────────────────
  const [modelo, setModelo] = useState("");
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<"lora" | "qlora" | "full">("lora");
  const [ambiente, setAmbiente] = useState<"lab" | "producao">("lab");
  const [params, setParams] = useState(PARAMS_DEFAULT);
  const [criando, setCriando] = useState(false);
  const [erroJob, setErroJob] = useState<string | null>(null);
  const [jobSelecionado, setJobSelecionado] = useState<number | null>(null);
  const [aoVivoEstado, setAoVivoEstado] = useState<LogPayload | null>(null);
  /** Derivado: sem job selecionado, nada de payload antigo vazando no painel. */
  const aoVivo = jobSelecionado !== null ? aoVivoEstado : null;

  const selecionarJob = (id: number | null) => {
    setJobSelecionado(id);
    setAoVivoEstado(null);
  };

  // SSE: logs + job ao vivo; fecha no terminal ou quando troca de job.
  useEffect(() => {
    if (jobSelecionado === null) return;
    const es = new EventSource(`/api/train/jobs/${jobSelecionado}/logs`);
    es.onmessage = (ev) => {
      try {
        const dados = JSON.parse(ev.data) as LogPayload;
        setAoVivoEstado(dados);
        if (["done", "failed", "cancelled"].includes(dados.job.status)) es.close();
      } catch {
        // payload parcial: ignora
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobSelecionado]);

  async function criarJob() {
    if (!atual || !datasetId) return;
    setCriando(true);
    setErroJob(null);
    try {
      await send("/api/train/jobs", "POST", {
        serverId: atual,
        baseModel: modelo.trim(),
        method: metodo,
        datasetId,
        ambiente,
        params,
      });
      setModelo("");
      void qc.invalidateQueries();
    } catch (e) {
      setErroJob(String((e as Error).message));
    } finally {
      setCriando(false);
    }
  }

  async function pararJob(j: SafeTrainJob) {
    if (!window.confirm(`Cancelar o treino #${j.id} (${j.baseModel})?`)) return;
    try {
      await send(`/api/train/jobs/${j.id}/stop`, "POST");
      void qc.invalidateQueries();
    } catch (e) {
      setErroJob(String((e as Error).message));
    }
  }

  // ── exports GGUF (T3) ───────────────────────────────────────────────────
  const [quantExport, setQuantExport] = useState<"f16" | "q8_0" | "q4_k_m">("q4_k_m");
  const [exportando, setExportando] = useState(false);
  const [erroExport, setErroExport] = useState<string | null>(null);

  async function exportarJob(j: SafeTrainJob) {
    setExportando(true);
    setErroExport(null);
    try {
      await send(`/api/train/jobs/${j.id}/export`, "POST", { quant: quantExport });
      void qc.invalidateQueries();
    } catch (e) {
      setErroExport(String((e as Error).message));
    } finally {
      setExportando(false);
    }
  }

  async function baixarArtifact(a: SafeTrainArtifact) {
    setErroExport(null);
    try {
      // Download via fetch autenticado + blob (o link direto não levaria cookies/sessão).
      const res = await fetch(`/api/train/artifacts/${a.id}/download`, { cache: "no-store" });
      if (!res.ok) {
        const dados = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(dados.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? `artifact-${a.id}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErroExport(String((e as Error).message));
    }
  }

  async function excluirArtifact(a: SafeTrainArtifact) {
    if (!window.confirm(`Remover o artifact "${a.quant ?? a.kind}" e o arquivo remoto?`)) return;
    setErroExport(null);
    try {
      await send(`/api/train/artifacts/${a.id}`, "DELETE");
      void qc.invalidateQueries();
    } catch (e) {
      setErroExport(String((e as Error).message));
    }
  }

  const artifactsDoServidor = artifacts.data?.artifacts ?? [];
  const jobsDoServidor = jobs.data?.jobs ?? [];
  const jobAtivo = aoVivo?.job ?? jobsDoServidor.find((j) => j.id === jobSelecionado) ?? null;
  const statusLevel = (s: string): "good" | "info" | "critical" | "warning" =>
    s === "done" ? "good" : s === "failed" ? "critical" : s === "cancelled" ? "warning" : "info";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Treinar" sub="Datasets, treinos e artefatos — Lab e Produção" />

      {/* Servidor do registro */}
      <Panel title="Servidor de treino">
        {servers.isLoading ? (
          <Loading />
        ) : servers.data?.servers.length ? (
          <Segmented
            label="Servidor (registro /servers)"
            value={String(atual ?? "")}
            onChange={(v) => {
              setServerId(Number(v));
              setPreview(null);
              selecionarJob(null);
            }}
            options={servers.data.servers.map((s) => ({ value: String(s.id), label: `${s.nome} (${s.tipo})` }))}
          />
        ) : (
          <Empty>Nenhum servidor no registro — cadastre em Meus Servidores.</Empty>
        )}
      </Panel>

      {/* Novo treino */}
      <Panel title="Novo treino">
        {!atual ? (
          <Empty>Selecione um servidor acima.</Empty>
        ) : (
          <div className="space-y-3">
            <fieldset>
              <legend className="mb-1.5 text-[12px] text-ink-3">Modelo base (HF hub ou tag local)</legend>
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="ex.: HuggingFaceTB/SmolLM2-135M"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[13px] text-ink placeholder:text-ink-3 focus:border-ice/50 focus:outline-none"
              />
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-[12px] text-ink-3">Dataset</legend>
              {datasets.data?.datasets.length ? (
                <select
                  value={datasetId ?? ""}
                  onChange={(e) => setDatasetId(Number(e.target.value))}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink focus:border-ice/50 focus:outline-none"
                >
                  <option value="">— escolha —</option>
                  {datasets.data.datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome} ({num(d.samples)} amostras · {d.formatoTreino})
                    </option>
                  ))}
                </select>
              ) : (
                <Empty>Nenhum dataset neste servidor — envie um abaixo.</Empty>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Segmented
                label="Método"
                value={metodo}
                onChange={setMetodo}
                options={[
                  { value: "lora", label: "LoRA" },
                  { value: "qlora", label: "QLoRA (4-bit)" },
                  { value: "full", label: "Completo" },
                ]}
              />
              <Segmented
                label="Ambiente"
                value={ambiente}
                onChange={setAmbiente}
                options={[
                  { value: "lab", label: "Lab" },
                  { value: "producao", label: "Produção" },
                ]}
              />
            </div>

            <details className="rounded-lg border border-line-soft px-3 py-2">
              <summary className="cursor-pointer text-[12px] text-ink-3 hover:text-ink">Hiperparâmetros (presets do Unsloth)</summary>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                {(
                  [
                    ["learningRate", "LR"],
                    ["epochs", "Épocas"],
                    ["r", "Rank (r)"],
                    ["alpha", "Alpha"],
                    ["dropout", "Dropout"],
                    ["batchSize", "Batch"],
                    ["gradientAccumulationSteps", "Grad. acum."],
                    ["maxSeqLength", "Seq. máx."],
                  ] as const
                ).map(([campo, rotulo]) => (
                  <label key={campo} className="space-y-0.5">
                    <span className="block text-ink-3">{rotulo}</span>
                    <input
                      type="number"
                      step="any"
                      value={params[campo]}
                      onChange={(e) => setParams((p) => ({ ...p, [campo]: Number(e.target.value) }))}
                      className="w-full rounded-md border border-line bg-surface px-2 py-1 font-mono text-ink focus:border-ice/50 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </details>

            <div className="flex items-center gap-2">
              <Button tone="primary" disabled={!modelo.trim() || !datasetId || criando} onClick={criarJob}>
                {criando ? "Enfileirando…" : "Enfileirar treino"}
              </Button>
              {modelo && (
                <Button
                  onClick={() => {
                    setModelo("");
                    setDatasetId(null);
                    setErroJob(null);
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
            {erroJob && <ErrorNote>{erroJob}</ErrorNote>}
          </div>
        )}
      </Panel>

      {/* Treinos (fila) */}
      <Panel title="Treinos">
        {jobs.isLoading ? (
          <Loading />
        ) : jobsDoServidor.length ? (
          <Table head={["#", "Modelo", "Dataset", "Método", "Ambiente", "Status", "Progresso", ""]}>
            {jobsDoServidor.map((j) => (
              <tr key={j.id} className={`cursor-pointer border-t border-line-soft/60 hover:bg-surface-2/40 ${jobSelecionado === j.id ? "bg-surface-2/60" : ""}`} onClick={() => selecionarJob(j.id)}>
                <td className="py-1.5 font-mono text-ink-2">#{j.id}</td>
                <td className="py-1.5 font-medium text-ink">{j.baseModel}</td>
                <td className="py-1.5 text-ink-2">{j.datasetPath?.split("/").pop() ?? "—"}</td>
                <td className="py-1.5 text-ink-2">{j.method}</td>
                <td className="py-1.5 text-ink-2">{j.ambiente}</td>
                <td className="py-1.5">
                  <Status level={statusLevel(j.status)} label={j.status} />
                </td>
                <td className="w-28 py-1.5">
                  <Meter value={j.progressPct / 100} label={`${j.progressPct}%`} />
                </td>
                <td className="py-1.5 text-right">
                  {(j.status === "queued" || j.status === "running") && (
                    <Button
                      tone="danger"
                      onClick={() => {
                        selecionarJob(j.id);
                        void pararJob(j);
                      }}
                    >
                      Parar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhum treino neste servidor ainda.</Empty>
        )}

        {/* Detalhe ao vivo */}
        {jobAtivo && (
          <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">
                Treino #{jobAtivo.id} · {jobAtivo.baseModel}
              </span>
              <Status level={statusLevel(jobAtivo.status)} label={jobAtivo.status} />
            </div>
            <Meter value={jobAtivo.progressPct / 100} label={`${jobAtivo.progressPct}%`} />
            <Kv
              items={[
                ["Método / ambiente", `${jobAtivo.method} · ${jobAtivo.ambiente}`],
                ["Dataset", jobAtivo.datasetPath?.split("/").pop() ?? "—"],
                ["Épocas", `${jobAtivo.epochsDone}/${jobAtivo.totalEpochs}`],
                ["Etapa", jobAtivo.current ?? "—"],
                ["GPU (compute apps)", jobAtivo.gpuMemUsedMib != null ? `${num(jobAtivo.gpuMemUsedMib)} MiB` : "—"],
                ["Loss final", jobAtivo.valLoss != null ? String(jobAtivo.valLoss) : "—"],
                ["Iniciado", jobAtivo.startedAt ? dateTime(jobAtivo.startedAt) : "—"],
                ["Erro", jobAtivo.error ?? "—"],
              ]}
            />

            {jobAtivo.lossHistory && jobAtivo.lossHistory.length > 1 && (
              <div style={{ height: 160 }} aria-label="Curva de loss" role="img">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={jobAtivo.lossHistory} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--line-soft)" vertical={false} />
                    <XAxis dataKey="step" stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis width={46} domain={["auto", "auto"]} stroke="var(--ink-3)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] shadow-lg">
                            step {payload[0].payload.step} · loss {Number(payload[0].payload.value).toFixed(4)}
                          </div>
                        ) : null
                      }
                    />
                    <Line type="monotone" dataKey="value" stroke="var(--ice)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {aoVivo?.log ? (
              <Code>{aoVivo.log.split("\n").slice(-14).join("\n") || "(sem linhas ainda)"}</Code>
            ) : (
              jobSelecionado !== null && <Loading label="Lendo train.log" />
            )}

            {/* Exportar GGUF (T3) — só treinos concluídos */}
            {jobAtivo.status === "done" && (
              <div className="space-y-2 border-t border-line-soft pt-3">
                <Segmented
                  label="Exportar para GGUF"
                  value={quantExport}
                  onChange={setQuantExport}
                  options={[
                    { value: "q4_k_m", label: "q4_k_m (4-bit)" },
                    { value: "q8_0", label: "q8_0 (8-bit)" },
                    { value: "f16", label: "f16 (sem quant)" },
                  ]}
                />
                <div className="flex items-center gap-2">
                  <Button tone="primary" disabled={exportando} onClick={() => exportarJob(jobAtivo)}>
                    {exportando ? "Enfileirando…" : `Exportar ${quantExport}`}
                  </Button>
                  <span className="text-[12px] text-ink-3">roda no icewall-quant (merge + convert + quantize) via fila própria</span>
                </div>
                {erroExport && <ErrorNote>{erroExport}</ErrorNote>}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Artefatos (adapters + exports GGUF) */}
      <Panel title="Artefatos">
        {artifacts.isLoading ? (
          <Loading />
        ) : artifactsDoServidor.length ? (
          <Table head={["#", "Job", "Tipo", "Quant", "Status", "Tamanho", "Promovido", ""]}>
            {artifactsDoServidor.map((a) => (
              <tr key={a.id} className="border-t border-line-soft/60">
                <td className="py-1.5 font-mono text-ink-2">#{a.id}</td>
                <td className="py-1.5 text-ink-2">{a.jobId ? `#${a.jobId}` : "—"}</td>
                <td className="py-1.5 font-medium text-ink">{a.kind}</td>
                <td className="py-1.5 text-ink-2">{a.quant ?? "—"}</td>
                <td className="py-1.5">
                  <Status level={a.status === "done" ? "good" : a.status === "failed" ? "critical" : "info"} label={a.status} />
                  {a.error && <div className="text-[11px] text-critical">{a.error}</div>}
                </td>
                <td className="py-1.5 text-ink-2">{a.kind === "adapter" ? "dir" : bytes(a.sizeBytes)}</td>
                <td className="py-1.5 text-ink-3">{a.promovido ? (a.promoDestino ?? "sim") : "—"}</td>
                <td className="py-1.5 text-right">
                  <span className="inline-flex gap-1.5">
                    {a.status === "done" && (
                      <Button onClick={() => baixarArtifact(a)}>{a.kind === "gguf" ? "Baixar GGUF" : "Baixar"}</Button>
                    )}
                    {a.status !== "pending" && a.status !== "running" && (
                      <Button tone="danger" onClick={() => excluirArtifact(a)}>
                        Remover
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhum artefato — treinos concluídos registram o adapter aqui, e exports GGUF aparecem nesta tabela.</Empty>
        )}
      </Panel>

      {/* Datasets */}
      <Panel title="Datasets">
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            aria-label="Enviar arquivo de dataset"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const f = e.dataTransfer.files[0];
              if (f) {
                setFile(f);
                setResultado(null);
                setErro(null);
              }
            }}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
              arrastando ? "border-ice/60 bg-ice/10" : "border-line bg-surface-2/40 hover:bg-surface-2"
            }`}
          >
            {file ? (
              <span className="text-[13px] text-ink">
                {file.name} <span className="text-ink-3">({bytes(file.size)})</span>
              </span>
            ) : (
              <span className="text-[13px] text-ink-2">Arraste o dataset aqui ou clique (.jsonl, .json, .csv, .txt — máx. 50 MB)</span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".jsonl,.json,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setResultado(null);
                  setErro(null);
                }
              }}
            />
          </div>

          <Segmented
            label="Formato de treino (conversão do JSONL)"
            value={formatoTreino}
            onChange={setFormatoTreino}
            options={[
              { value: "chat", label: "Chat ({ messages })" },
              { value: "text", label: "Texto ({ text })" },
            ]}
          />

          <div className="flex items-center gap-2">
            <Button tone="primary" disabled={!file || !atual || enviando} onClick={enviar}>
              {enviando ? "Enviando…" : "Enviar dataset"}
            </Button>
            {file && (
              <Button
                onClick={() => {
                  setFile(null);
                  setResultado(null);
                  setErro(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                Limpar
              </Button>
            )}
          </div>

          {erro && <ErrorNote>{erro}</ErrorNote>}
          {resultado && (
            <Kv
              items={[
                ["Dataset", resultado.dataset.nome],
                ["Destino", <Code key="d">{resultado.dataset.remotePath}</Code>],
                ["Amostras válidas", num(resultado.validacao.total)],
                ["Duplicadas descartadas", num(resultado.validacao.duplicados)],
                ["Vazias/inválidas descartadas", num(resultado.validacao.vazios)],
              ]}
            />
          )}

          {datasets.isLoading ? (
            <Loading />
          ) : datasets.data?.datasets.length ? (
            <Table head={["Dataset", "Origem", "Treino", "Amostras", "Tamanho", "Enviado", ""]}>
              {datasets.data.datasets.map((d) => (
                <tr key={d.id} className="border-t border-line-soft/60">
                  <td className="py-1.5 font-medium text-ink">{d.nome}</td>
                  <td className="py-1.5 text-ink-2">{d.formato}</td>
                  <td className="py-1.5 text-ink-2">{d.formatoTreino}</td>
                  <td className="py-1.5 text-ink-2">{num(d.samples)}</td>
                  <td className="py-1.5 text-ink-2">{bytes(d.sizeBytes)}</td>
                  <td className="py-1.5 text-ink-3">{dateTime(d.atualizadoEm)}</td>
                  <td className="py-1.5 text-right">
                    <span className="inline-flex gap-1.5">
                      <Button onClick={() => abrirPreview(d)}>Amostras</Button>
                      <Button tone="danger" onClick={() => excluirDataset(d)}>
                        Remover
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nenhum dataset neste servidor ainda — envie o primeiro acima.</Empty>
          )}
          {previewLoading && <Loading label="Lendo amostras" />}
          {previewErro && <ErrorNote>{previewErro}</ErrorNote>}
          {preview && (
            <div className="mt-2 space-y-2">
              <Kv
                items={[
                  ["Dataset", preview.nome],
                  ["Arquivo", <Code key="p">{preview.remotePath}</Code>],
                  ["Amostras no dataset", num(preview.samples)],
                ]}
              />
              {preview.amostras.map((a, i) => (
                <Code key={i}>{JSON.stringify(a, null, 2)}</Code>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { getJson, send, sendForm, useLive } from "@/lib/api";
import { bytes, dateTime, num } from "@/lib/format";
import { Button, Code, Empty, ErrorNote, Kv, Loading, PageHeader, Panel, Segmented, Table } from "../ui";
import type { SafeServer } from "@/app/api/train/servers/schemas";
import type { SafeTrainDataset } from "@/app/api/train/datasets/schemas";

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

/**
 * Aba Treinar (Fase 2). Etapa T1 entrega a seção de Datasets: seleção de
 * servidor (registro `servers`), upload com conversão/validação e preview
 * das amostras. O stepper de treino (servidor → modelo → dataset → config →
 * executar) entra na T2 sobre esta mesma página.
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

  // ── upload ───────────────────────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [formatoTreino, setFormatoTreino] = useState<"chat" | "text">("chat");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<UploadOk | null>(null);
  const [arrastando, setArrastando] = useState(false);

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

  // ── preview / remoção ───────────────────────────────────────────────────
  const [preview, setPreview] = useState<PreviewDataset | null>(null);
  const [previewErro, setPreviewErro] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  async function excluir(d: SafeTrainDataset) {
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
            }}
            options={servers.data.servers.map((s) => ({ value: String(s.id), label: `${s.nome} (${s.tipo})` }))}
          />
        ) : (
          <Empty>Nenhum servidor no registro — cadastre em Meus Servidores.</Empty>
        )}
      </Panel>

      {/* Upload */}
      <Panel title="Novo dataset">
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
            <Upload size={18} className="text-ink-3" aria-hidden />
            {file ? (
              <span className="text-[13px] text-ink">
                {file.name} <span className="text-ink-3">({bytes(file.size)})</span>
              </span>
            ) : (
              <span className="text-[13px] text-ink-2">Arraste o arquivo aqui ou clique para escolher (.jsonl, .json, .csv, .txt — máx. 50 MB)</span>
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
        </div>
      </Panel>

      {/* Lista de datasets do servidor */}
      <Panel title={`Datasets${atual ? "" : " (sem servidor selecionado)"}`}>
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
                    <Button tone="danger" onClick={() => excluir(d)}>
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
          <div className="mt-3 space-y-2">
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
      </Panel>
    </div>
  );
}

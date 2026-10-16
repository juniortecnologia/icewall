import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { trainDatasets, trainJobs } from "../db/schema";
import { driverFor, execOnServer } from "../executor";
import { shellPath } from "../spark/ssh";

/**
 * Datasets do `/treinar` (Fase 2, Etapa T1): upload → conversão para JSONL
 * (formato alvo chat/text) → validação (total, duplicados, vazios) → envio
 * pelo driver do servidor (put) → registro em `train_datasets`.
 *
 * O caminho remoto vive sempre em `$HOME/icewall/datasets/{slug}.jsonl`
 * (resolvido por servidor); o nome do dataset é o slug do arquivo original e
 * é único por servidor (índice único). Comandos remotos saem de constantes +
 * `shellPath`/`shellArg` — nunca de texto da interface.
 */

export const FORMATOS = ["jsonl", "json", "csv", "txt"] as const;
export type Formato = (typeof FORMATOS)[number];

export const TAMANHO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB por arquivo

const homesCache = new Map<number, string>();

/**
 * Diretório de datasets no servidor: `$HOME/icewall/datasets` — resolvido uma
 * vez por servidor e cacheado. (No Spark, `/mnt` é root-only: o legado
 * /mnt/data não é utilizável.)
 */
export async function datasetsDir(serverId: number): Promise<string> {
  const emCache = homesCache.get(serverId);
  if (emCache) return emCache;
  const res = await execOnServer(serverId, "echo $HOME", 10_000);
  const home = res.stdout.trim();
  if (res.code !== 0 || !home.startsWith("/")) {
    throw new DatasetError("remoto", `não consegui resolver $HOME no servidor: ${res.stderr.trim() || `exit ${res.code}`}`);
  }
  const dir = `${home.replace(/\/+$/, "")}/icewall/datasets`;
  homesCache.set(serverId, dir);
  return dir;
}

/** Só para testes: limpa o cache de homes resolvidos. */
export function resetDatasetsHomes(): void {
  homesCache.clear();
}

/** Erro de dataset com código estável — as rotas mapeiam para o status HTTP. */
export class DatasetError extends Error {
  constructor(
    readonly code: "formato_invalido" | "sem_amostras" | "nome_duplicado" | "em_uso" | "nao_encontrado" | "remoto",
    message: string,
  ) {
    super(message);
  }
}

export interface ValidacaoDataset {
  total: number;
  duplicados: number;
  vazios: number;
}

// ── nomes e formatos ─────────────────────────────────────────────────────────

/** Slug seguro para nome de arquivo remoto (passa no `shellArg`/`shellPath`). */
export function slugBase(nome: string): string {
  const semExt = nome.replace(/\.[^.]+$/, "");
  const slug = semExt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "dataset";
}

/** Formato de origem pela extensão do arquivo. */
export function detectarFormato(nome: string): Formato | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return (FORMATOS as readonly string[]).includes(ext) ? (ext as Formato) : null;
}

// ── CSV mínimo (aspas duplas, vírgula escapada, CRLF) ────────────────────────

export function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  const fechar = () => {
    linha.push(campo);
    campo = "";
    if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
    linha = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreAspas = false;
      } else campo += c;
    } else if (c === '"') entreAspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fechar();
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
  }
  return linhas;
}

// ── normalização de amostras ────────────────────────────────────────────────

type Mensagem = { role: "system" | "user" | "assistant"; content: string };

function primeiroTexto(o: Record<string, unknown>): string | null {
  for (const k of ["text", "content", "output", "completion", "response", "body"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function normalizarMensagens(valor: unknown[]): Mensagem[] | null {
  const msgs: Mensagem[] = [];
  for (const m of valor) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== "system" && role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return null;
    msgs.push({ role, content });
  }
  return msgs.length ? msgs : null;
}

/**
 * Normaliza uma amostra para o formato alvo: chat (`{ messages }`) ou texto
 * (`{ text }`). Reconhece messages (OpenAI-ish), Alpaca (instruction/input/
 * output/system), prompt/completion, user/assistant — e cai para texto quando
 * nada casa (a validação mostra quantas ficaram nesse caminho).
 */
export function normalizarAmostra(obj: unknown, formatoTreino: "chat" | "text"): unknown {
  if (typeof obj === "string") {
    const t = obj.trim();
    return t ? { text: t } : null;
  }
  if (obj === null || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  if (formatoTreino === "text") {
    const texto = primeiroTexto(o);
    return texto ? { text: texto } : null;
  }

  if (Array.isArray(o.messages)) {
    const msgs = normalizarMensagens(o.messages);
    if (msgs) return { messages: msgs };
  }
  if (typeof o.instruction === "string" && o.instruction.trim()) {
    const saida = typeof o.output === "string" ? o.output : typeof o.response === "string" ? o.response : null;
    if (saida === null || !saida.trim()) return null;
    const msgs: Mensagem[] = [];
    if (typeof o.system === "string" && o.system.trim()) msgs.push({ role: "system", content: o.system });
    const entrada = typeof o.input === "string" ? o.input.trim() : "";
    msgs.push({ role: "user", content: entrada ? `${o.instruction}\n\n${entrada}` : o.instruction });
    msgs.push({ role: "assistant", content: saida });
    return { messages: msgs };
  }
  if (typeof o.prompt === "string" && typeof o.completion === "string" && o.prompt.trim() && o.completion.trim()) {
    return { messages: [{ role: "user", content: o.prompt }, { role: "assistant", content: o.completion }] };
  }
  if (typeof o.user === "string" && typeof o.assistant === "string" && o.user.trim() && o.assistant.trim()) {
    return { messages: [{ role: "user", content: o.user }, { role: "assistant", content: o.assistant }] };
  }
  const texto = primeiroTexto(o);
  return texto ? { text: texto } : null;
}

// ── extração por formato de origem ──────────────────────────────────────────

function tentarJson(linha: string): unknown | undefined {
  try {
    return JSON.parse(linha) as unknown;
  } catch {
    return undefined; // contada como vazia/inválida
  }
}

function amostrasJson(texto: string): unknown[] {
  const parsed = tentarJson(texto);
  if (parsed === undefined) return [];
  if (Array.isArray(parsed)) return parsed;
  return [parsed];
}

function amostrasCsv(texto: string): unknown[] {
  const linhas = parseCsv(texto);
  if (linhas.length < 2) return [];
  const header = linhas[0].map((h) => h.trim().toLowerCase());
  const idx = (nomes: string[]) => header.findIndex((h) => nomes.includes(h));
  const iInst = idx(["instruction", "instrucao", "instrução"]);
  const iInput = idx(["input", "entrada"]);
  const iOut = idx(["output", "response", "resposta", "saida"]);
  const iSys = idx(["system", "sistema"]);
  const iText = idx(["text", "texto"]);
  const iP = idx(["prompt"]);
  const iC = idx(["completion"]);
  const iU = idx(["user", "usuario", "usuário"]);
  const iA = idx(["assistant", "assistente"]);
  const corpo = linhas.slice(1);
  if (iInst >= 0 && iOut >= 0) {
    return corpo.map((r) => ({
      instruction: r[iInst] ?? "",
      input: iInput >= 0 ? r[iInput] : undefined,
      output: iOut >= 0 ? r[iOut] : "",
      system: iSys >= 0 ? r[iSys] : undefined,
    }));
  }
  if (iP >= 0 && iC >= 0) return corpo.map((r) => ({ prompt: r[iP] ?? "", completion: r[iC] ?? "" }));
  if (iU >= 0 && iA >= 0) return corpo.map((r) => ({ user: r[iU] ?? "", assistant: r[iA] ?? "" }));
  const col = iText >= 0 ? iText : 0;
  return corpo.map((r) => ({ text: r[col] ?? "" }));
}

/** Converte o texto de origem para JSONL alvo e devolve as linhas + validação. */
export function converterParaJsonl(texto: string, formato: Formato, formatoTreino: "chat" | "text"): { jsonl: string; validacao: ValidacaoDataset } {
  const brutas: unknown[] =
    formato === "json"
      ? amostrasJson(texto)
      : formato === "csv"
        ? amostrasCsv(texto)
        : texto
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .map((l) => (formato === "jsonl" ? tentarJson(l) : { text: l }));

  const vistos = new Set<string>();
  const validacao: ValidacaoDataset = { total: 0, duplicados: 0, vazios: 0 };
  const linhas: string[] = [];
  for (const bruta of brutas) {
    if (bruta === undefined) {
      validacao.vazios++;
      continue;
    }
    const amostra = normalizarAmostra(bruta, formatoTreino);
    if (amostra === null) {
      validacao.vazios++;
      continue;
    }
    const linha = JSON.stringify(amostra);
    if (vistos.has(linha)) {
      validacao.duplicados++;
      continue;
    }
    vistos.add(linha);
    linhas.push(linha);
    validacao.total++;
  }
  return { jsonl: linhas.length ? `${linhas.join("\n")}\n` : "", validacao };
}

// ── operações (upload / remoção / preview) ──────────────────────────────────

export interface UploadEntrada {
  serverId: number;
  nomeArquivo: string;
  conteudo: Buffer;
  formatoTreino: "chat" | "text";
}

export interface UploadResultado {
  id: number;
  nome: string;
  remotePath: string;
  validacao: ValidacaoDataset;
}

/**
 * Fluxo completo do upload: converte, valida, confere conflito de nome,
 * grava em tmp local, envia pelo driver do servidor e registra no banco.
 * A falha de driver vira `DatasetError("remoto")` — mensagem clara, 502.
 */
export async function enviarDataset(entrada: UploadEntrada): Promise<UploadResultado> {
  const formato = detectarFormato(entrada.nomeArquivo);
  if (!formato) {
    throw new DatasetError("formato_invalido", "formato não suportado — use .jsonl, .json, .csv ou .txt");
  }
  const { jsonl, validacao } = converterParaJsonl(entrada.conteudo.toString("utf8"), formato, entrada.formatoTreino);
  if (validacao.total === 0) {
    throw new DatasetError("sem_amostras", "nenhuma amostra válida no arquivo (veja vazios/duplicados)");
  }

  const nome = slugBase(entrada.nomeArquivo);
  const db = getDb();
  const conflito = db
    .select({ id: trainDatasets.id })
    .from(trainDatasets)
    .where(and(eq(trainDatasets.serverId, entrada.serverId), eq(trainDatasets.nome, nome)))
    .limit(1)
    .get();
  if (conflito) {
    throw new DatasetError("nome_duplicado", `já existe um dataset "${nome}" neste servidor — renomeie o arquivo`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icewall-ds-"));
  const tmpLocal = path.join(tmpDir, `${nome}.jsonl`);
  let remotePath = "";
  let driver: ReturnType<typeof driverFor> | null = null;
  try {
    const dir = await datasetsDir(entrada.serverId);
    remotePath = `${dir}/${nome}.jsonl`;
    await fsp.writeFile(tmpLocal, jsonl, "utf8");
    driver = driverFor(entrada.serverId);
    try {
      await driver.mkdir(dir, "755");
      await driver.put(tmpLocal, remotePath);
    } catch (err) {
      throw new DatasetError("remoto", `falha ao enviar para o servidor: ${String(err instanceof Error ? err.message : err)}`);
    }
    const row = db
      .insert(trainDatasets)
      .values({
        serverId: entrada.serverId,
        nome,
        formato,
        formatoTreino: entrada.formatoTreino,
        remotePath,
        sizeBytes: Buffer.byteLength(jsonl, "utf8"),
        samples: validacao.total,
        validacao,
      })
      .returning()
      .get()!;
    return { id: row.id, nome: row.nome, remotePath: row.remotePath, validacao };
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    driver?.close();
  }
}

/** Remove o arquivo remoto e o registro. Bloqueia se um job em fila/execução usa o dataset. */
export async function removerDataset(id: number): Promise<{ remotePath: string }> {
  const db = getDb();
  const row = db.select().from(trainDatasets).where(eq(trainDatasets.id, id)).limit(1).get();
  if (!row) {
    throw new DatasetError("nao_encontrado", `dataset ${id} não encontrado`);
  }
  const emUso = db
    .select({ id: trainJobs.id })
    .from(trainJobs)
    .where(and(eq(trainJobs.datasetId, id), inArray(trainJobs.status, ["queued", "running"])))
    .limit(1)
    .get();
  if (emUso) {
    throw new DatasetError("em_uso", `dataset em uso pelo job ${emUso.id} (na fila ou em execução)`);
  }
  const res = await execOnServer(row.serverId, `rm -f ${shellPath(row.remotePath)}`, 15_000);
  if (res.code !== 0) {
    throw new DatasetError("remoto", `falha ao remover o arquivo remoto: ${res.stderr.trim() || `exit ${res.code}`}`);
  }
  db.delete(trainDatasets).where(eq(trainDatasets.id, id)).run();
  return { remotePath: row.remotePath };
}

export interface PreviewDataset {
  nome: string;
  remotePath: string;
  samples: number | null;
  amostras: unknown[];
}

/** Primeiras N amostras do dataset remoto (`head` pelo executor — barato). */
export async function previewDataset(id: number, quantidade = 10): Promise<PreviewDataset> {
  const row = getDb().select().from(trainDatasets).where(eq(trainDatasets.id, id)).limit(1).get();
  if (!row) {
    throw new DatasetError("nao_encontrado", `dataset ${id} não encontrado`);
  }
  const n = Math.max(1, Math.min(20, Math.floor(quantidade)));
  const res = await execOnServer(row.serverId, `head -n ${n} ${shellPath(row.remotePath)}`, 10_000);
  if (res.code !== 0) {
    throw new DatasetError("remoto", `falha ao ler o dataset remoto: ${res.stderr.trim() || `exit ${res.code}`}`);
  }
  const amostras = res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, n)
    .map((l) => {
      try {
        return JSON.parse(l) as unknown;
      } catch {
        return { texto: l };
      }
    });
  return { nome: row.nome, remotePath: row.remotePath, samples: row.samples, amostras };
}

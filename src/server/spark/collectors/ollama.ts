import "server-only";
import { z } from "zod";
import type { OllamaModel, OllamaSnapshot } from "@/lib/types";
import { addEvent, getServerSnapshot, putSnapshot, serverSnapshotKey, trackReachability } from "../../lib/store";
import { execOnServer, type ServerRef } from "../../executor";
import type { ExecResult } from "@/lib/servers/server-driver";

/**
 * Ollama é uma CAPACIDADE OPCIONAL por servidor (Etapa 03): quando o serviço
 * está inativo, o estado legítimo é "offline" — nem erro, nem lista vazia.
 * A base URL é derivada do servidor do registro (local → 127.0.0.1; ssh →
 * host do registro), em vez do env global OLLAMA_URL. O env antigo continua
 * servindo apenas às ações manuais (allowlist), fora do escopo dos coletores.
 */
const OLLAMA_PORT = Number(process.env.OLLAMA_PORT ?? 11434);

/** Legacy: base global usada apenas pelas ações manuais (allowlist). */
const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://10.0.5.18:11434").replace(/\/$/, "");

export function ollamaBaseUrl(server: ServerRef): string {
  const host = server.tipo === "local" ? "127.0.0.1" : server.host;
  return `http://${host}:${OLLAMA_PORT}`;
}

/** Sonda, pelo driver do servidor, se a porta do Ollama está escutando. */
export function ollamaProbeCmd(port = OLLAMA_PORT): string {
  return `echo @@port@@; (ss -tlnH 2>/dev/null || netstat -tln 2>/dev/null) | grep -qE ':${port}([[:space:]]|$)' && echo LISTEN || echo NONE`;
}

const details = z
  .object({
    family: z.string().nullish(),
    parameter_size: z.string().nullish(),
    quantization_level: z.string().nullish(),
    context_length: z.number().nullish(),
  })
  .nullish();

const tagsSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      size: z.number(),
      digest: z.string(),
      modified_at: z.string(),
      details,
      capabilities: z.array(z.string()).nullish(),
    }),
  ),
});

const psSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      size: z.number(),
      size_vram: z.number().nullish(),
      expires_at: z.string().nullish(),
      context_length: z.number().nullish(),
    }),
  ),
});

export async function ollamaFetch(path: string, init?: RequestInit, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(`${OLLAMA_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text().catch(() => "")}`.trim());
  return res.json();
}

/**
 * Ações por servidor (Etapa 04): fala com o Ollama de UM servidor do registro
 * com a base derivada dele — nunca a constante do env global.
 */
export async function ollamaFetchOn(server: ServerRef, path: string, init?: RequestInit, timeoutMs = 8000): Promise<unknown> {
  return fetchFrom(ollamaBaseUrl(server), path, init, timeoutMs);
}

async function fetchFrom(base: string, path: string, init?: RequestInit, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text().catch(() => "")}`.trim());
  return res.json();
}

type Exec = (serverId: number, cmd: string, timeoutMs?: number) => Promise<ExecResult>;

/** Coleta o estado do Ollama em UM servidor do registro, pelo driver dele (Etapa 03). */
export async function collectOllama(server: ServerRef, exec: Exec = execOnServer): Promise<void> {
  const key = serverSnapshotKey(server.id, "ollama");
  const base = ollamaBaseUrl(server);

  // Primeiro, o estado do serviço — pelo driver do servidor, para distinguir
  // "serviço inativo" (legítimo) de "servidor inacessível" (erro).
  const probe = await exec(server.id, ollamaProbeCmd(), 15_000);
  if (probe.code !== 0 || !probe.stdout.includes("@@port@@")) {
    const msg = probe.stderr.trim() || `sonda saiu com ${probe.code}`;
    putSnapshot(key, null, msg);
    trackReachability(`ollama:${server.id}`, false, `Ollama de ${server.nome}`, msg, "crit", server.id);
    return;
  }
  if (probe.stdout.includes("NONE")) {
    const snap: OllamaSnapshot = {
      status: "offline",
      url: base,
      version: null,
      models: [],
      loaded: [],
      reason: "serviço inativo",
    };
    putSnapshot(key, snap);
    trackReachability(`ollama:${server.id}`, false, `Ollama de ${server.nome}`, "serviço inativo", "warn", server.id);
    return;
  }

  try {
    const [version, tags, ps] = await Promise.all([
      fetchFrom(base, "/api/version").then((v) => z.object({ version: z.string() }).parse(v).version),
      fetchFrom(base, "/api/tags").then((v) => tagsSchema.parse(v)),
      fetchFrom(base, "/api/ps").then((v) => psSchema.parse(v)),
    ]);
    const models: OllamaModel[] = tags.models
      .map((m) => ({
        name: m.name,
        size: m.size,
        digest: m.digest,
        modifiedAt: m.modified_at,
        family: m.details?.family ?? null,
        parameterSize: m.details?.parameter_size ?? null,
        quantization: m.details?.quantization_level ?? null,
        contextLength: m.details?.context_length ?? null,
        capabilities: m.capabilities ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const snap: OllamaSnapshot = {
      status: "online",
      url: base,
      version,
      models,
      loaded: ps.models.map((m) => ({
        name: m.name,
        size: m.size,
        sizeVram: m.size_vram ?? 0,
        expiresAt: m.expires_at ?? "",
        contextLength: m.context_length ?? null,
      })),
    };
    const prev = getServerSnapshot<OllamaSnapshot>(server.id, "ollama")?.data ?? null;
    if (prev?.status === "online") diffModels(prev, snap, server.id);
    putSnapshot(key, snap);
    trackReachability(`ollama:${server.id}`, true, `Ollama de ${server.nome}`, undefined, "crit", server.id);
  } catch (err) {
    putSnapshot(key, null, String(err));
    trackReachability(`ollama:${server.id}`, false, `Ollama de ${server.nome}`, String(err), "warn", server.id);
  }
}

function diffModels(prev: OllamaSnapshot, next: OllamaSnapshot, serverId: number): void {
  const before = new Map(prev.models.map((m) => [m.name, m.digest]));
  const after = new Map(next.models.map((m) => [m.name, m.digest]));
  for (const [name, digest] of after) {
    if (!before.has(name)) addEvent("model", "info", `Modelo instalado: ${name}`, undefined, serverId);
    else if (before.get(name) !== digest) addEvent("model", "info", `Modelo atualizado: ${name}`, undefined, serverId);
  }
  for (const name of before.keys()) {
    if (!after.has(name)) addEvent("model", "warn", `Modelo removido: ${name}`, undefined, serverId);
  }
  if (prev.version && next.version && prev.version !== next.version) {
    addEvent("runtime", "info", `Ollama ${prev.version} → ${next.version}`, undefined, serverId);
  }
}

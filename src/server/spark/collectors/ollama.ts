import "server-only";
import { z } from "zod";
import type { OllamaModel, OllamaSnapshot } from "@/lib/types";
import { addEvent, getSnapshot, putSnapshot, trackReachability } from "../../lib/store";

export const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://10.0.5.18:11434").replace(/\/$/, "");

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

export async function collectOllama(): Promise<void> {
  try {
    const [version, tags, ps] = await Promise.all([
      ollamaFetch("/api/version").then((v) => z.object({ version: z.string() }).parse(v).version),
      ollamaFetch("/api/tags").then((v) => tagsSchema.parse(v)),
      ollamaFetch("/api/ps").then((v) => psSchema.parse(v)),
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
      url: OLLAMA_URL,
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
    diffModels(getSnapshot<OllamaSnapshot>("ollama")?.data ?? null, snap);
    putSnapshot("ollama", snap);
    trackReachability("ollama", true, "Ollama do Spark");
  } catch (err) {
    putSnapshot("ollama", null, String(err));
    trackReachability("ollama", false, "Ollama do Spark", String(err));
  }
}

function diffModels(prev: OllamaSnapshot | null, next: OllamaSnapshot): void {
  if (!prev) return;
  const before = new Map(prev.models.map((m) => [m.name, m.digest]));
  const after = new Map(next.models.map((m) => [m.name, m.digest]));
  for (const [name, digest] of after) {
    if (!before.has(name)) addEvent("model", "info", `Modelo instalado: ${name}`);
    else if (before.get(name) !== digest) addEvent("model", "info", `Modelo atualizado: ${name}`);
  }
  for (const name of before.keys()) {
    if (!after.has(name)) addEvent("model", "warn", `Modelo removido: ${name}`);
  }
  if (prev.version && next.version && prev.version !== next.version) {
    addEvent("runtime", "info", `Ollama ${prev.version} → ${next.version}`);
  }
}

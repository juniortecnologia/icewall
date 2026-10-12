import "server-only";
import { getSetting, putSetting } from "../lib/store";
import { isModelName } from "./modelfile";

const MODEL_SOURCES_KEY = "ollama_model_sources";

const DEFAULT_MODEL_SOURCES: Record<string, string> = {
  "qwen3.8-code:27b-128k": "qwen3.8:27b",
  "qwen3.8-code:27b-64k": "qwen3.8:27b",
};

const OUTDATED_DEFAULTS: Record<string, string> = {
  "qwen3.8-code:27b-128k": "qwen3.8-code:27b",
  "qwen3.8-code:27b-64k": "qwen3.8-code:27b",
};

function validSources(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([model, source]) => isModelName(model) && typeof source === "string" && isModelName(source) && model !== source,
    ),
  );
}

export function getModelSources(): Record<string, string> {
  const saved = getSetting<unknown>(MODEL_SOURCES_KEY, null);
  if (saved === null) {
    putSetting(MODEL_SOURCES_KEY, DEFAULT_MODEL_SOURCES);
    return { ...DEFAULT_MODEL_SOURCES };
  }
  const sources = validSources(saved);
  let changed = false;
  for (const [model, oldSource] of Object.entries(OUTDATED_DEFAULTS)) {
    if (sources[model] === oldSource) {
      sources[model] = DEFAULT_MODEL_SOURCES[model];
      changed = true;
    }
  }
  if (changed) putSetting(MODEL_SOURCES_KEY, sources);
  return sources;
}

export function setModelSource(model: string, source: string | undefined): void {
  const sources = getModelSources();
  if (source) {
    if (!isModelName(source)) throw new Error("tag de origem inválida");
    if (source === model) throw new Error("a origem deve ser diferente do nome desta variante");
    sources[model] = source;
  } else {
    delete sources[model];
  }
  putSetting(MODEL_SOURCES_KEY, sources);
}

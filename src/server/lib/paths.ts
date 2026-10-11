import os from "node:os";
import path from "node:path";

/** Variável de ambiente com caminho: aceita "~/" (o Node não expande sozinho). */
export function envPath(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw === "~" ? os.homedir() : raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
}

export const SKILL_DIR = path.join(os.homedir(), ".claude/skills/delegate-local");
export const MODELS_JSON = envPath("DELEGATE_MODELS_JSON", path.join(SKILL_DIR, "models.json"));
export const RUNS_LOG = envPath("DELEGATE_RUNS_LOG", path.join(os.homedir(), ".cache/delegate-local/runs.jsonl"));
export const CLAUDE_PROJECTS = envPath("CLAUDE_PROJECTS_DIR", path.join(os.homedir(), ".claude/projects"));
export const DELEGATE_BIN = envPath("DELEGATE_BIN", path.join(SKILL_DIR, "scripts/ollama-delegate"));

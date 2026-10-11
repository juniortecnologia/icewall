import path from "node:path";
import type { PacoteFerramenta, PacotePrompt, TipoAlvo } from "./tipos";

// Tradução dos pacotes que os hooks do Claude Code mandam (UserPromptSubmit e PreToolUse).

type Objeto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);
const textoCheio = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const origemDe = (cwd: string) => path.basename(cwd) || cwd;

/** Ferramentas que passam pelo portão de saída e o campo de onde sai o alvo. */
const ALVOS: Record<string, { tipo: TipoAlvo; campo: string }> = {
  Bash: { tipo: "comando", campo: "command" },
  Write: { tipo: "arquivo", campo: "file_path" },
  Edit: { tipo: "arquivo", campo: "file_path" },
  MultiEdit: { tipo: "arquivo", campo: "file_path" },
  NotebookEdit: { tipo: "arquivo", campo: "notebook_path" },
};

export function lerGanchoPrompt(corpo: unknown, agora = new Date()): PacotePrompt | null {
  if (!ehObjeto(corpo)) return null;
  const texto = textoCheio(corpo.prompt);
  const cwd = textoCheio(corpo.cwd);
  if (!texto || !cwd) return null;
  return { texto, ts: agora.getTime(), origem: origemDe(cwd), cwd, sessao: textoCheio(corpo.session_id) };
}

/** `"ignorar"` = ferramenta fora do portão de saída; `null` = pacote inválido. */
export function lerGanchoFerramenta(corpo: unknown, agora = new Date()): PacoteFerramenta | null | "ignorar" {
  if (!ehObjeto(corpo)) return null;
  const ferramenta = textoCheio(corpo.tool_name);
  const cwd = textoCheio(corpo.cwd);
  if (!ferramenta || !cwd) return null;
  if (!Object.hasOwn(ALVOS, ferramenta)) return "ignorar";
  const { tipo, campo } = ALVOS[ferramenta];
  const alvo = ehObjeto(corpo.tool_input) ? textoCheio(corpo.tool_input[campo]) : null;
  if (!alvo) return null;
  return {
    tipo,
    alvo,
    regra: null,
    ts: agora.getTime(),
    origem: origemDe(cwd),
    cwd,
    sessao: textoCheio(corpo.session_id),
  };
}

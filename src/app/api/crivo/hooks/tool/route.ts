import { guardMutation } from "@/server/api";
import { respostaGanchoFerramenta } from "@/server/crivo/respostas";

/** Gancho PreToolUse do Claude Code: registra o comando ou arquivo e nunca segura (por enquanto). */
export async function POST(req: Request) {
  return guardMutation(req) ?? respostaGanchoFerramenta(req);
}

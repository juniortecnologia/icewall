import { guardMutation } from "@/server/api";
import { respostaGanchoPrompt } from "@/server/crivo/respostas";

/**
 * Gancho UserPromptSubmit do Claude Code (curl -sf com -H 'x-icewall: 1'). O corpo da resposta 200 vira
 * a saída do gancho; qualquer erro HTTP faz o curl calar e o prompt segue.
 */
export async function POST(req: Request) {
  return guardMutation(req) ?? respostaGanchoPrompt(req);
}

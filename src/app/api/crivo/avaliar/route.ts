import { guardMutation } from "@/server/api";
import { respostaAvaliar } from "@/server/crivo/respostas";

/** Área de teste da aba Crivo: avalia sem gravar. Protegida porque gasta tokens da Jev. */
export async function POST(req: Request) {
  return guardMutation(req) ?? respostaAvaliar(req);
}

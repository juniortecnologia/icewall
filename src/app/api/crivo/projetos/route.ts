import { guardMutation } from "@/server/api";
import { respostaProjeto } from "@/server/crivo/respostas";

/** Descrição à mão e liga/desliga de um projeto, na aba Crivo. */
export async function POST(req: Request) {
  return guardMutation(req) ?? respostaProjeto(req);
}

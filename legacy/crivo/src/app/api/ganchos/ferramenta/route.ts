import { respostaGanchoFerramenta } from "@/lib/respostas";

export function POST(request: Request) {
  return respostaGanchoFerramenta(request);
}

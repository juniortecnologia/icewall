import { respostaAvaliar } from "@/lib/respostas";

export function POST(request: Request) {
  return respostaAvaliar(request);
}

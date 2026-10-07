import { respostaGanchoPrompt } from "@/lib/respostas";

export function POST(request: Request) {
  return respostaGanchoPrompt(request);
}

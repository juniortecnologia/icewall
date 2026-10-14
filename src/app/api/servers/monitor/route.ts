import { json } from "@/server/api";
import { serverMonitor } from "@/server/queries";

/** Monitor multi-servidor (Etapa 04): health, docker, Ollama e vLLM por servidor. */
export function GET() {
  return json(serverMonitor);
}

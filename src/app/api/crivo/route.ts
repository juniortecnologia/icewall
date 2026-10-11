import { json } from "@/server/api";
import { montarFeed } from "@/server/crivo/respostas";

export function GET() {
  return json(montarFeed);
}

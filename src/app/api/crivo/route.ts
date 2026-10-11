import { json } from "@/server/api";
import { montarFeed } from "@/server/crivo/respostas";

/** `?origem=` filtra por projeto; sem ele, todos. */
export function GET(req: Request) {
  return json(() => montarFeed(new URL(req.url).searchParams.get("origem")?.trim() || null));
}

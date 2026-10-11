import { json } from "@/server/api";
import { tokens } from "@/server/queries";

export function GET(req: Request) {
  return json(() => tokens(Math.min(Number(new URL(req.url).searchParams.get("days")) || 30, 365)));
}

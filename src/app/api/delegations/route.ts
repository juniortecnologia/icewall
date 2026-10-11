import { json } from "@/server/api";
import { delegations } from "@/server/queries";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return json(() => delegations(Math.min(Number(q.get("days")) || 30, 365), q.get("bench") === "1"));
}

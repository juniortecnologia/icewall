import { json } from "@/server/api";
import { setTierModel } from "@/server/bench/models-json";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return json(() => setTierModel(q.get("tier") ?? "", q.get("model") ?? "", true));
}

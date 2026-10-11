import { json } from "@/server/api";
import { metricSeries } from "@/server/queries";

export function GET(req: Request) {
  return json(() => metricSeries(new URL(req.url).searchParams.get("range") ?? "6h"));
}

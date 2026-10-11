import { json } from "@/server/api";
import { containers } from "@/server/queries";

export function GET() {
  return json(containers);
}

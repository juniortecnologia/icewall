import { json } from "@/server/api";
import { system } from "@/server/queries";

export function GET() {
  return json(system);
}

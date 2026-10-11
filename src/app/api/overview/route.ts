import { json } from "@/server/api";
import { overview } from "@/server/queries";

export function GET() {
  return json(overview);
}

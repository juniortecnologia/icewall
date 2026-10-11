import { json } from "@/server/api";
import { bancada } from "@/server/queries";

export function GET() {
  return json(bancada);
}

import { json } from "@/server/api";
import { models } from "@/server/queries";

export function GET() {
  return json(models);
}

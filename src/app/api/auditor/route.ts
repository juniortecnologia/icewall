import { json } from "@/server/api";
import { auditor } from "@/server/queries";

export function GET() {
  return json(auditor);
}

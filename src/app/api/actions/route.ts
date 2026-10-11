import { z } from "zod";
import { guardMutation, json } from "@/server/api";
import { isActionId, runAction } from "@/server/actions/allowlist";
import { actionLog } from "@/server/queries";

export function GET() {
  return json(actionLog);
}

const body = z.object({ action: z.string(), target: z.string().min(1).max(200), arg: z.string().max(200).optional() });

export async function POST(req: Request) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isActionId(parsed.data.action)) return Response.json({ error: "ação inválida" }, { status: 400 });
  const { action, target, arg } = parsed.data;
  return json(() => runAction(action as Parameters<typeof runAction>[0], target, arg));
}

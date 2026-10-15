import { z } from "zod";
import { json, validationError } from "@/server/api";
import { isActionId, runAction } from "@/server/actions/allowlist";
import { actionLog } from "@/server/queries";
import { withAuth } from "@/server/auth/withAuth";

export function GET() {
  return json(actionLog);
}

const bodySchema = z.object({
  action: z.string(),
  target: z.string().min(1).max(200),
  arg: z.string().max(200).optional(),
  /** Servidor alvo da ação (Etapa 04); sem ele, o servidor principal. */
  serverId: z.number().int().positive().optional(),
});

export const POST = withAuth(async (req) => {
  const { action, target, arg, serverId } = req.validatedBody!;
  if (!isActionId(action)) return validationError("ação inválida");
  return json(() => runAction(action as Parameters<typeof runAction>[0], target, { arg, serverId }));
}, { bodySchema, context: "actions" });

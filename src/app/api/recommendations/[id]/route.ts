import { eq } from "drizzle-orm";
import { z } from "zod";
import { guardMutation, json } from "@/server/api";
import { getDb, schema } from "@/server/db/client";

const body = z.object({ status: z.enum(["open", "dismissed", "done"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "status inválido" }, { status: 400 });
  return json(() => {
    getDb().update(schema.recommendations).set({ status: parsed.data.status }).where(eq(schema.recommendations.id, Number(id))).run();
    return { ok: true };
  });
}

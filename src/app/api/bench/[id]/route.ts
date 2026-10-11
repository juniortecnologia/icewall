import { and, eq, inArray } from "drizzle-orm";
import { guardMutation, json } from "@/server/api";
import { getDb, schema } from "@/server/db/client";
import { benchResultsFor } from "@/server/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return json(() => benchResultsFor(Number(id)));
}

/** Cancela um benchmark na fila ou em execução (o runner para entre um item e outro). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  return json(() => {
    getDb()
      .update(schema.benchRuns)
      .set({ status: "cancelled", finishedAt: Date.now() })
      .where(and(eq(schema.benchRuns.id, Number(id)), inArray(schema.benchRuns.status, ["queued", "running"])))
      .run();
    return { ok: true };
  });
}

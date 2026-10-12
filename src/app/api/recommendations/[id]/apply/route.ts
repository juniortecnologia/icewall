import { guardMutation } from "@/server/api";
import { getDb, schema } from "@/server/db/client";
import { eq } from "drizzle-orm";
import { applyRecommendation, getRecommendationExecutable } from "@/server/actions/recommendation-apply";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (isNaN(numId)) return Response.json({ error: "id inválido" }, { status: 400 });

  const rec = getDb().select().from(schema.recommendations).where(eq(schema.recommendations.id, numId)).get();
  if (!rec) return Response.json({ error: "recomendação não encontrada" }, { status: 404 });

  const executable = getRecommendationExecutable(rec);
  return Response.json(executable);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const numId = Number(id);
  if (isNaN(numId)) return Response.json({ error: "id inválido" }, { status: 400 });

  const result = await applyRecommendation(numId);
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 400 });
  }

  return Response.json({ ok: true, message: result.message });
}

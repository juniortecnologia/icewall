import { z } from "zod";
import { guardMutation, json } from "@/server/api";
import { getDb, schema } from "@/server/db/client";
import { bench } from "@/server/queries";

export function GET() {
  return json(bench);
}

const body = z.object({
  kind: z.enum(["perf", "quality"]),
  models: z.array(z.string()).min(1).max(12),
  tasks: z.array(z.string()).max(50).default([]),
  samples: z.number().int().min(1).max(5).default(1),
});

export async function POST(req: Request) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { kind, models, tasks, samples } = parsed.data;
  const known = new Set(bench().models);
  const validTasks = new Set(bench().tasks.map((t) => t.id));
  if (models.some((m) => !known.has(m))) return Response.json({ error: "modelo desconhecido" }, { status: 400 });
  if (kind === "quality" && (!tasks.length || tasks.some((t) => !validTasks.has(t)))) {
    return Response.json({ error: "tarefas inválidas" }, { status: 400 });
  }
  return json(() =>
    getDb().insert(schema.benchRuns).values({ kind, models, tasks: kind === "quality" ? tasks : [], samples, status: "queued" }).returning().get(),
  );
}

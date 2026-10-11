import { guardMutation, json } from "@/server/api";
import { recheck, runJob } from "@/server/scheduler";

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const { name } = await ctx.params;
  return json(async () => {
    await (name === "recheck" ? recheck() : runJob(name));
    return { ok: true };
  });
}

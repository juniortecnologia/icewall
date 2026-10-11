import { z } from "zod";
import { guardMutation, json } from "@/server/api";
import { putSetting } from "@/server/lib/store";

const w = z.number().min(0).max(1);
const body = z.object({ quality: w, firstTry: w, speed: w, latency: w, memory: w });

export async function PUT(req: Request) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "pesos inválidos" }, { status: 400 });
  return json(() => {
    putSetting("bench:weights", parsed.data);
    return parsed.data;
  });
}

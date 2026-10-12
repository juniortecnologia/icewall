import { NextResponse } from "next/server";
import { evaluatePreRouting, type TaskRequest } from "@/server/jev/router";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TaskRequest;
    if (!body || typeof body.task !== "string" || !body.task.trim()) {
      return NextResponse.json({ error: "Campo 'task' é obrigatório" }, { status: 400 });
    }
    const result = evaluatePreRouting(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

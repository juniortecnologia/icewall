import "server-only";
import { connection } from "next/server";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Resposta JSON de leitura: sempre em tempo de requisição (nunca pré-renderizada). */
export async function json<T>(fn: () => T | Promise<T>): Promise<Response> {
  await connection();
  try {
    return Response.json(await fn());
  } catch (err) {
    console.error("[icewall] api:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * Rotas que alteram estado: exigem o header x-icewall (força preflight CORS, que não respondemos)
 * e origem local. Evita que uma página qualquer aberta no navegador dispare ações no Spark.
 */
export function guardMutation(req: Request): Response | null {
  if (req.headers.get("x-icewall") !== "1") return Response.json({ error: "header x-icewall ausente" }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (!ALLOWED_HOSTS.has(new URL(origin).hostname)) return Response.json({ error: "origem não permitida" }, { status: 403 });
    } catch {
      return Response.json({ error: "origem inválida" }, { status: 403 });
    }
  }
  return null;
}

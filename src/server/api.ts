import "server-only";
import { connection } from "next/server";
import { createErrorHandler, validationError, authError, forbiddenError, notFoundError, errorResponse } from "./api-errors";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const apiErrorHandler = createErrorHandler("api");

/** Resposta JSON de leitura: sempre em tempo de requisição (nunca pré-renderizada). */
export async function json<T>(fn: () => T | Promise<T>, init?: ResponseInit): Promise<Response> {
  await connection();
  try {
    return Response.json(await fn(), init);
  } catch (err) {
    return apiErrorHandler(err);
  }
}

/**
 * Rotas que alteram estado: exigem o header x-icewall (força preflight CORS, que não respondemos)
 * e origem local. Evita que uma página qualquer aberta no navegador dispare ações no Spark.
 */
export function guardMutation(req: Request): Response | null {
  if (req.headers.get("x-icewall") !== "1") return forbiddenError("header x-icewall ausente");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (!ALLOWED_HOSTS.has(new URL(origin).hostname)) return forbiddenError("origem não permitida");
    } catch {
      return forbiddenError("origem inválida");
    }
  }
  return null;
}

// Re-export error helpers for convenience
export { validationError, authError, forbiddenError, notFoundError, errorResponse };

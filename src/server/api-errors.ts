/**
 * Error handling utilities for API routes.
 * Prevents internal error details from leaking to clients.
 * Returns generic error messages with a correlation ID for debugging.
 */

import { randomUUID } from "node:crypto";

/**
 * Creates a server-side error handler that logs the full error
 * and returns a sanitized response with a correlation ID.
 */
export function createErrorHandler(context: string) {
  return (err: unknown, customMessage?: string): Response => {
    const errorId = randomUUID().slice(0, 8); // Short ID for correlation
    const message = err instanceof Error ? err.message : String(err);

    // Log full error server-side with correlation ID
    console.error(`[icewall] ${context} [${errorId}]:`, err);

    // Return sanitized response to client
    return Response.json(
      {
        error: customMessage || "Erro interno do servidor",
        errorId,
      },
      { status: 500 }
    );
  };
}

/**
 * Wrapper for async route handlers that automatically catches errors
 * and returns sanitized responses.
 */
export function withErrorHandling<T extends unknown[]>(
  context: string,
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return createErrorHandler(context)(err);
    }
  };
}

/**
 * Sanitized error response helper for use inside try/catch blocks.
 * Use when you need custom status codes or messages.
 */
export function errorResponse(err: unknown, context: string, customMessage?: string, status = 500): Response {
  const errorId = randomUUID().slice(0, 8);
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[icewall] ${context} [${errorId}]:`, err);
  return Response.json(
    {
      error: customMessage || "Erro interno do servidor",
      errorId,
    },
    { status }
  );
}

/**
 * Helper for validation errors (400) - no logging needed, just sanitized response.
 */
export function validationError(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * Helper for auth errors (401) - no logging needed.
 */
export function authError(message = "Não autorizado"): Response {
  return Response.json({ error: message }, { status: 401 });
}

/**
 * Helper for forbidden errors (403) - no logging needed.
 */
export function forbiddenError(message = "Acesso negado"): Response {
  return Response.json({ error: message }, { status: 403 });
}

/**
 * Helper for not found errors (404) - no logging needed.
 */
export function notFoundError(message = "Recurso não encontrado"): Response {
  return Response.json({ error: message }, { status: 404 });
}
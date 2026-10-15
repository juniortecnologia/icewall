/**
 * Centralized authentication wrapper for API routes.
 * Combines session validation, 2FA check, role authorization, zod validation, and guardMutation.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, type UserSession } from "./jwt";
import { SESSION_COOKIE_NAME } from "./session";
import { validationError, authError, forbiddenError, errorResponse, guardMutation } from "@/server/api";
import type { ZodError, ZodSchema, ZodTypeAny } from "zod";
import type { ZodIssue } from "zod";

/** Options for the withAuth wrapper */
export interface WithAuthOptions<T extends ZodTypeAny = ZodTypeAny> {
  /** Require 2FA to be passed (default: true) */
  requireTwoFactor?: boolean;
  /** Require specific role(s) (default: any authenticated) */
  roles?: string[];
  /** Zod schema for request body validation (optional) */
  bodySchema?: T;
  /** Context string for error logging */
  context?: string;
  /** Skip guardMutation check (for GET/read-only routes) */
  skipMutationGuard?: boolean;
}

/** Authenticated request with session and validated body */
export interface AuthenticatedRequest<T = unknown> extends Request {
  session: UserSession;
  validatedBody?: T;
}

/** Result of auth check - either session or error response */
type AuthResult = { session: UserSession } | Response;

/**
 * Core authentication check - returns session or error Response
 */
async function checkAuth(options: WithAuthOptions): Promise<AuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return authError("Sessão expirada ou inválida");
  }

  const session = await verifySession(token);
  if (!session) {
    return authError("Sessão expirada ou inválida");
  }

  // Check 2FA requirement
  if (options.requireTwoFactor !== false && !session.twoFactorPassed) {
    return authError("Autenticação em dois fatores necessária");
  }

  // Check role requirement
  if (options.roles && options.roles.length > 0) {
    if (!options.roles.includes(session.role)) {
      return forbiddenError("Acesso negado: permissão insuficiente");
    }
  }

  return { session };
}

/**
 * Centralized auth wrapper for API route handlers.
 * Usage:
 *   export const GET = withAuth(async (req) => { ... }, { roles: ['admin'] });
 *   export const POST = withAuth(async (req) => { ... }, { bodySchema: schema, requireTwoFactor: true });
 */
export function withAuth<T extends ZodTypeAny = ZodTypeAny>(
  handler: (req: AuthenticatedRequest<z.infer<T>>) => Promise<Response>,
  options: WithAuthOptions<T> = {}
) {
  return async (req: Request): Promise<Response> => {
    const context = options.context || "api";

    try {
      // For mutating routes, check guardMutation first
      if (!options.skipMutationGuard && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE")) {
        const denied = guardMutation(req);
        if (denied) return denied;
      }

      // Check authentication
      const authResult = await checkAuth(options);
      if (authResult instanceof Response) {
        return authResult;
      }
      const { session } = authResult;

      // Validate body schema if provided
      let validatedBody: z.infer<T> | undefined;
      if (options.bodySchema) {
        const rawBody = await req.json().catch(() => null);
        const parsed = options.bodySchema.safeParse(rawBody);
        if (!parsed.success) {
          const issues = parsed.error.issues as ZodIssue[];
          return validationError("Payload inválido: " + issues.map((e) => e.message).join(", "));
        }
        validatedBody = parsed.data;
      }

      // Create authenticated request with session and validated body
      const authReq = Object.assign(req, { session, validatedBody }) as AuthenticatedRequest<z.infer<T>>;

      // Call the handler
      return await handler(authReq);
    } catch (err) {
      return errorResponse(err, context);
    }
  };
}

/** Convenience wrapper for admin-only routes */
export function withAdminAuth<T extends ZodTypeAny = ZodTypeAny>(
  handler: (req: AuthenticatedRequest<z.infer<T>>) => Promise<Response>,
  options: Omit<WithAuthOptions<T>, "roles"> = {}
) {
  return withAuth(handler, { ...options, roles: ["admin"] });
}

/** Convenience wrapper for read-only routes (no mutation guard, no 2FA required by default) */
export function withReadAuth<T extends ZodTypeAny = ZodTypeAny>(
  handler: (req: AuthenticatedRequest<z.infer<T>>) => Promise<Response>,
  options: WithAuthOptions<T> = {}
) {
  return withAuth(handler, { ...options, skipMutationGuard: true, requireTwoFactor: false });
}

/** Get session without throwing - for optional auth scenarios */
export async function getSessionOptional(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
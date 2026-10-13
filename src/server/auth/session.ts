import { cookies } from "next/headers";
import { verifySessionEdge, type UserSession } from "./jwt-edge";

export const SESSION_COOKIE_NAME = "icewall_session";

/** Get the currently logged-in user session from HTTP-only cookie */
export async function getSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionEdge(token);
}

/** Check if current user is authenticated and has passed 2FA (if enabled) */
export async function requireAuth(): Promise<UserSession> {
  const session = await getSession();
  if (!session || !session.twoFactorPassed) {
    throw new Error("Unauthorized");
  }
  return session;
}

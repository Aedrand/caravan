import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client (M0.6). No absolute baseURL on purpose: requests go to
 * the current origin's /api/auth/* — the Vite dev proxy forwards them to the
 * Hono server on :3000, and in production the server serves the SPA and the
 * API from the same origin.
 */
export const authClient = createAuthClient();

export type SessionData = typeof authClient.$Infer.Session;

/**
 * One-shot session lookup for route guards (`beforeLoad`). Returns null when
 * signed out or when the session check fails (treat as signed out).
 */
export async function fetchSession(): Promise<SessionData | null> {
  const { data } = await authClient.getSession();
  return data ?? null;
}

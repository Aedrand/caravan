import { createMiddleware } from "hono/factory";
import type { AuthedEnv } from "./session";

/**
 * 403-gates a route group on the instance-admin role. Runs AFTER requireUser,
 * which has already validated the session and set `c.get("user")` (the first
 * user becomes admin; see auth/index.ts). Kept separate from the 401 gate so
 * "not signed in" and "signed in but not admin" stay distinct on the wire.
 */
export function requireAdmin() {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    if (c.get("user").role !== "admin") {
      return c.json({ error: { code: "forbidden", message: "Admin access required" } }, 403);
    }
    await next();
  });
}

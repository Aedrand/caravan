import { createMiddleware } from "hono/factory";
import type { Auth } from "./index";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Hono env for routes behind requireUser — `c.get("user")` is the session user. */
export type AuthedEnv = { Variables: { user: SessionUser } };

/** 401-gates a route group on a Better Auth session and exposes the user. */
export function requireUser(auth: Auth) {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
    }
    const { id, name, email } = session.user;
    const role = (session.user as { role?: string | null }).role ?? "member";
    c.set("user", { id, name, email, role });
    await next();
  });
}

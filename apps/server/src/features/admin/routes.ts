import { Hono } from "hono";
import type { AuthedEnv } from "../../auth/session";
import { getSetting, isRegistrationOpen } from "../../core/settings";
import type { Db } from "../../db";

/**
 * Instance admin routes (Track D), mounted at /api/admin behind
 * requireUser + requireAdmin (the gates are applied at the mount in app.ts).
 *
 * D.3 expands this router (settings write, members/trips/disk usage, VACUUM backup).
 */
export function createAdminRoutes(deps: { db: Db }) {
  const { db } = deps;

  return new Hono<AuthedEnv>().get("/settings", (c) => {
    return c.json({
      registrationOpen: isRegistrationOpen(db),
      // instance_name has no migration/seed yet — absent until D.3 adds the write path.
      instanceName: getSetting(db, "instance_name") ?? null,
    });
  });
}

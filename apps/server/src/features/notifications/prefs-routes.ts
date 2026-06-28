import { Hono } from "hono";
import { z } from "zod";
import type { AuthedEnv } from "../../auth/session";
import { getDigestEnabled, setDigestEnabled } from "../../core/notification-prefs";
import type { Db } from "../../db";

/**
 * Per-user notification preferences (D.2), mounted at /api/me/notification-prefs
 * behind requireUser (the session gate is applied at the mount in app.ts). Keyed
 * to the session user, so there's no id in the path.
 */

const PrefsSchema = z.object({
  digestEnabled: z.boolean(),
});

export function createNotificationPrefsRoutes(deps: { db: Db }) {
  const { db } = deps;

  return new Hono<AuthedEnv>()
    .get("/notification-prefs", (c) => {
      const userId = c.get("user").id;
      return c.json({ digestEnabled: getDigestEnabled(db, userId) });
    })

    .put("/notification-prefs", async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          { error: { code: "invalid_json", message: "request body must be JSON" } },
          400,
        );
      }
      const parsed = PrefsSchema.safeParse(body);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "invalid body";
        return c.json({ error: { code: "invalid_body", message } }, 400);
      }

      const userId = c.get("user").id;
      setDigestEnabled(db, userId, parsed.data.digestEnabled);
      return c.json({ digestEnabled: getDigestEnabled(db, userId) });
    });
}

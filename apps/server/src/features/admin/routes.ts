import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthedEnv } from "../../auth/session";
import { getSetting, isRegistrationOpen, setSetting } from "../../core/settings";
import type { Db } from "../../db";
import { schema } from "../../db";

/**
 * Instance admin routes (Track D), mounted at /api/admin behind
 * requireUser + requireAdmin (the gates are applied at the mount in app.ts).
 *
 * D.3 covers the instance panel: read/write settings, an at-a-glance overview
 * (counts + on-disk size), and a VACUUM-INTO backup download.
 */

/** The app's two-axis token system (TD-11): structure × palette, presets only. */
const ThemeSchema = z.object({
  style: z.enum(["poster", "material"]),
  theme: z.enum(["warm", "dusk"]),
});
type ThemeSetting = z.infer<typeof ThemeSchema>;

const SettingsSchema = z.object({
  instanceName: z.string().trim().max(100),
  registrationOpen: z.boolean(),
  theme: ThemeSchema,
});

/** Stored as a JSON string under the `theme` key; null/garbage reads as "unset". */
function readTheme(db: Db): ThemeSetting | null {
  const raw = getSetting(db, "theme");
  if (!raw) return null;
  try {
    const parsed = ThemeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readSettings(db: Db) {
  return {
    registrationOpen: isRegistrationOpen(db),
    instanceName: getSetting(db, "instance_name") ?? null,
    theme: readTheme(db),
  };
}

/** better-sqlite3 carries the open file's path on `.name`; the data dir is its parent. */
function fileSizeOf(filePath: string): number {
  return existsSync(filePath) ? statSync(filePath).size : 0;
}

export function createAdminRoutes(deps: { db: Db }) {
  const { db } = deps;
  const dbPath = db.$client.name;
  const dataDir = path.dirname(dbPath);

  return (
    new Hono<AuthedEnv>()
      .get("/settings", (c) => c.json(readSettings(db)))

      .put("/settings", async (c) => {
        let body: unknown;
        try {
          body = await c.req.json();
        } catch {
          return c.json(
            { error: { code: "invalid_json", message: "request body must be JSON" } },
            400,
          );
        }
        const parsed = SettingsSchema.safeParse(body);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "invalid body";
          return c.json({ error: { code: "invalid_body", message } }, 400);
        }

        const { instanceName, registrationOpen, theme } = parsed.data;
        setSetting(db, "instance_name", instanceName);
        setSetting(db, "registration_open", registrationOpen ? "true" : "false");
        setSetting(db, "theme", JSON.stringify(theme));

        return c.json(readSettings(db));
      })

      // At-a-glance instance health: who/what is here and how big it's gotten.
      .get("/overview", (c) => {
        const users = db.select({ n: count() }).from(schema.user).get()?.n ?? 0;
        const trips = db.select({ n: count() }).from(schema.trips).get()?.n ?? 0;
        const activeMembers =
          db
            .select({ n: count() })
            .from(schema.tripMembers)
            .where(eq(schema.tripMembers.status, "active"))
            .get()?.n ?? 0;

        return c.json({
          users,
          trips,
          activeMembers,
          dbBytes: fileSizeOf(dbPath),
          // WAL only exists between checkpoints; absent is a legitimate 0.
          walBytes: fileSizeOf(`${dbPath}-wal`),
        });
      })

      // Consistent, online snapshot via VACUUM INTO (safe with WAL + readers).
      // The DB is small at this scale, so we buffer the temp file, delete it,
      // then return the bytes — no stream/unlink race.
      .get("/backup", (c) => {
        const tmpPath = path.join(dataDir, "caravan-backup.tmp.db");
        // A stale temp from a crashed prior run would make VACUUM INTO fail.
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
        try {
          // Single-quoted SQL string literal; escape any embedded quote.
          db.$client.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
          const bytes = new Uint8Array(readFileSync(tmpPath));
          return c.body(bytes, 200, {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": 'attachment; filename="caravan-backup.db"',
          });
        } catch {
          return c.json(
            { error: { code: "backup_failed", message: "could not create backup" } },
            500,
          );
        } finally {
          if (existsSync(tmpPath)) unlinkSync(tmpPath);
        }
      })
  );
}

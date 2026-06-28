import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

/**
 * Per-user notification preferences (D.2). A missing row means "all defaults",
 * so reads default to ON and writes upsert lazily — the digest never has to
 * pre-seed a row for every user.
 */

/** Whether the user receives the daily digest. Defaults to true when no row exists. */
export function getDigestEnabled(db: Db, userId: string): boolean {
  const row = db
    .select({ digestEnabled: schema.notificationPrefs.digestEnabled })
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, userId))
    .get();
  return row?.digestEnabled ?? true;
}

/** Set the user's digest opt-in, upserting the prefs row and bumping updatedAt. */
export function setDigestEnabled(db: Db, userId: string, enabled: boolean): void {
  const now = Date.now();
  db.insert(schema.notificationPrefs)
    .values({ userId, digestEnabled: enabled, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { digestEnabled: enabled, updatedAt: now },
    })
    .run();
}

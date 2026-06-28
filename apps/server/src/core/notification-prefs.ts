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

/**
 * The set of user ids who have opted OUT of the daily digest, in one query — for
 * the digest job, which would otherwise call getDigestEnabled once per recipient
 * (N+1). Same semantics as getDigestEnabled: a user absent from the set defaults
 * to enabled (only rows with digestEnabled = false land here), so callers treat
 * "not in the set" as opted in.
 */
export function getDigestOptedOut(db: Db): Set<string> {
  const rows = db
    .select({ userId: schema.notificationPrefs.userId })
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.digestEnabled, false))
    .all();
  return new Set(rows.map((r) => r.userId));
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

import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

/** Typed access to the instance_settings key/value table. */

export function getSetting(db: Db, key: string): string | undefined {
  const row = db
    .select({ value: schema.instanceSettings.value })
    .from(schema.instanceSettings)
    .where(eq(schema.instanceSettings.key, key))
    .get();
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(schema.instanceSettings)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.instanceSettings.key,
      set: { value, updatedAt: Date.now() },
    })
    .run();
}

/**
 * Open registration defaults OFF: once the instance has its admin, new
 * accounts arrive via trip invite links, not the front door (PD-10).
 */
export function isRegistrationOpen(db: Db): boolean {
  return getSetting(db, "registration_open") === "true";
}

import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

/**
 * Active-membership lookup — the authorization primitive for every
 * trip-scoped route (ghosts are read as non-members everywhere; PD-9).
 */
export function getActiveMember(db: Db, tripId: string, userId: string) {
  return db
    .select()
    .from(schema.tripMembers)
    .where(
      and(
        eq(schema.tripMembers.tripId, tripId),
        eq(schema.tripMembers.userId, userId),
        eq(schema.tripMembers.status, "active"),
      ),
    )
    .get();
}

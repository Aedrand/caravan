import { type CreateTripInput, createId } from "@caravan/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";

/**
 * Trip CRUD that lives OUTSIDE the mutation pipeline (M1.1): creating,
 * duplicating, and deleting whole trips has no version to bump or feed to
 * write into — there are no members to notify until the trip exists.
 * Everything inside an existing trip goes through mutations instead.
 */

export function createTrip(
  db: Db,
  args: { userId: string; input: CreateTripInput; now: number },
): { trip: typeof schema.trips.$inferSelect; member: typeof schema.tripMembers.$inferSelect } {
  const { userId, input, now } = args;

  return db.transaction((tx) => {
    const trip = tx
      .insert(schema.trips)
      .values({
        id: createId(),
        name: input.name,
        destination: input.destination,
        startDate: input.startDate,
        endDate: input.endDate,
        currency: input.currency,
        version: 0,
        archivedAt: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const member = tx
      .insert(schema.tripMembers)
      .values({
        id: createId(),
        tripId: trip.id,
        userId,
        role: "owner",
        status: "active",
        joinedAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return { trip, member };
  });
}

/**
 * Duplicate-as-template (PD-2): copies the trip shell and every activity,
 * but none of the people — the caller starts as the sole owner of the copy.
 */
export function duplicateTrip(
  db: Db,
  args: { userId: string; sourceTripId: string; now: number },
): { trip: typeof schema.trips.$inferSelect } {
  const { userId, sourceTripId, now } = args;

  return db.transaction((tx) => {
    const source = tx.select().from(schema.trips).where(eq(schema.trips.id, sourceTripId)).get();
    if (!source) throw new Error(`duplicateTrip: source trip ${sourceTripId} not found`);

    const activities = tx
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.tripId, sourceTripId))
      .all();

    const trip = tx
      .insert(schema.trips)
      .values({
        id: createId(),
        name: `${source.name} (copy)`,
        destination: source.destination,
        startDate: source.startDate,
        endDate: source.endDate,
        currency: source.currency,
        version: 0,
        archivedAt: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const ownerMemberId = createId();
    tx.insert(schema.tripMembers)
      .values({
        id: ownerMemberId,
        tripId: trip.id,
        userId,
        role: "owner",
        status: "active",
        joinedAt: now,
        updatedAt: now,
      })
      .run();

    for (const activity of activities) {
      tx.insert(schema.activities)
        .values({
          id: createId(),
          tripId: trip.id,
          date: activity.date,
          position: activity.position,
          title: activity.title,
          startTime: activity.startTime,
          endTime: activity.endTime,
          placeName: activity.placeName,
          address: activity.address,
          lat: activity.lat,
          lng: activity.lng,
          placeProvider: activity.placeProvider,
          placeRef: activity.placeRef,
          category: activity.category,
          notes: activity.notes,
          linkUrl: activity.linkUrl,
          // Attribution restarts in the copy: the new owner "created" them all.
          createdBy: ownerMemberId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { trip };
  });
}

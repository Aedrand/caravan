import { createId, type FeedEvent } from "@caravan/shared";
import { and, eq } from "drizzle-orm";
import { type ExecuteDeps, MutationError } from "../../core/mutations";
import { serializeMember } from "../../core/serialize";
import type { Db } from "../../db";
import { schema } from "../../db";

/**
 * Joining a trip lives OUTSIDE the mutation pipeline — the joiner isn't a
 * member yet, which is the pipeline's one precondition. It still honors the
 * pipeline's invariants: one transaction, a version bump, a feed event
 * (type "member.join"), and a member post-image broadcast after commit.
 *
 * Ghost-rejoin reattaches the SAME membership row (PD-9): history, authored
 * content, and (later) expense participation come back with the person.
 */
export function joinTrip(
  db: Db,
  args: {
    userId: string;
    invite: typeof schema.inviteLinks.$inferSelect;
    now: number;
    broadcast?: ExecuteDeps["broadcast"];
  },
): { tripId: string; memberId: string; outcome: "joined" | "rejoined" | "already_member" } {
  const { userId, invite, now, broadcast } = args;

  const result = db.transaction(() => {
    const trip = db.select().from(schema.trips).where(eq(schema.trips.id, invite.tripId)).get();
    if (!trip) throw new MutationError(404, "trip_not_found", "trip not found");
    if (trip.archivedAt !== null) {
      throw new MutationError(409, "trip_archived", "this trip is archived (read-only)");
    }

    const existing = db
      .select()
      .from(schema.tripMembers)
      .where(and(eq(schema.tripMembers.tripId, trip.id), eq(schema.tripMembers.userId, userId)))
      .get();

    if (existing?.status === "active") {
      // Multi-use links get re-clicked; that's a navigation, not an event.
      return {
        tripId: trip.id,
        memberId: existing.id,
        outcome: "already_member" as const,
        event: null,
        entity: null,
      };
    }

    let memberId: string;
    let outcome: "joined" | "rejoined";
    if (existing) {
      // Ghost reattach: same row, the invite's role, original joinedAt.
      db.update(schema.tripMembers)
        .set({ status: "active", role: invite.role, updatedAt: now })
        .where(eq(schema.tripMembers.id, existing.id))
        .run();
      memberId = existing.id;
      outcome = "rejoined";
    } else {
      memberId = createId();
      db.insert(schema.tripMembers)
        .values({
          id: memberId,
          tripId: trip.id,
          userId,
          role: invite.role,
          status: "active",
          joinedAt: now,
          updatedAt: now,
        })
        .run();
      outcome = "joined";
    }

    const name =
      db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .get()?.name ?? "Someone";

    const version = trip.version + 1;
    db.update(schema.trips)
      .set({ version, updatedAt: now })
      .where(eq(schema.trips.id, trip.id))
      .run();

    const event: FeedEvent = {
      id: createId(),
      tripId: trip.id,
      version,
      actorType: "user",
      actorMemberId: memberId,
      type: "member.join",
      entityType: "member",
      entityId: memberId,
      payload: { name, role: invite.role },
      createdAt: now,
    };
    db.insert(schema.feedEvents)
      .values({ ...event, payload: JSON.stringify(event.payload) })
      .run();

    const memberRow = db
      .select()
      .from(schema.tripMembers)
      .where(eq(schema.tripMembers.id, memberId))
      .get();
    const entity = memberRow ? serializeMember(memberRow, name) : null;

    return { tripId: trip.id, memberId, outcome, event, entity };
  });

  if (result.event) {
    broadcast?.(result.tripId, result.event, result.entity);
  }
  return { tripId: result.tripId, memberId: result.memberId, outcome: result.outcome };
}

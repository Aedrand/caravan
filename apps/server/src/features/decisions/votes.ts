import { createId } from "@caravan/shared";
import { and, asc, eq } from "drizzle-orm";
import { type MutationCtx, MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Activity votes (Track A.1 / PD-2): a single positive "I'm in" toggle per
 * member per activity. Toggling is idempotent at the (activity, member) level
 * thanks to the unique index; the handler flips the row on/off.
 *
 * The event's post-image is the surviving vote row (or null on retract), and
 * the feed payload carries `on` so the feed verb reads "voted for" vs "removed
 * their vote". The web layer rebuilds the per-activity voter set from the
 * snapshot's flat `votes` array — no extra payload needed.
 */

function loadActivity(ctx: MutationCtx, activityId: string) {
  const activity = ctx.tx
    .select()
    .from(schema.activities)
    .where(and(eq(schema.activities.id, activityId), eq(schema.activities.tripId, ctx.trip.id)))
    .get();
  if (!activity) throw new MutationError(404, "activity_not_found", "activity not found");
  return activity;
}

registerMutation("vote.toggle", {
  // Voting is a normal collaborative act — editors and owners (viewers can't).
  role: "editor",
  apply(ctx, payload) {
    const activity = loadActivity(ctx, payload.activityId);

    const existing = ctx.tx
      .select()
      .from(schema.activityVotes)
      .where(
        and(
          eq(schema.activityVotes.activityId, activity.id),
          eq(schema.activityVotes.memberId, ctx.member.id),
        ),
      )
      .get();

    if (existing) {
      ctx.tx.delete(schema.activityVotes).where(eq(schema.activityVotes.id, existing.id)).run();
      return {
        // Retract: entityId is the (now-deleted) vote id → null post-image.
        entityType: "vote",
        entityId: existing.id,
        feedPayload: { activityTitle: activity.title, on: false },
      };
    }

    const id = createId();
    ctx.tx
      .insert(schema.activityVotes)
      .values({
        id,
        tripId: ctx.trip.id,
        activityId: activity.id,
        memberId: ctx.member.id,
        createdAt: ctx.now,
      })
      .run();
    return {
      entityType: "vote",
      entityId: id,
      feedPayload: { activityTitle: activity.title, on: true },
    };
  },
});

/** Voter membership ids for an activity, oldest first — used by tests/reads. */
export function votersFor(ctx: MutationCtx, activityId: string): string[] {
  return ctx.tx
    .select({ memberId: schema.activityVotes.memberId })
    .from(schema.activityVotes)
    .where(eq(schema.activityVotes.activityId, activityId))
    .orderBy(asc(schema.activityVotes.createdAt))
    .all()
    .map((r) => r.memberId);
}

import { and, eq } from "drizzle-orm";
import { type MutationCtx, MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Itinerary mutations (M1.6): the first — and semantically richest —
 * consumers of the pipeline. Per-field LWW on update; date+position move as
 * one atomic pair so the canonical concurrent conflict (two members moving
 * the same activity) converges to a single winner (TD-1/PD-5).
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

registerMutation("activity.create", {
  role: "editor",
  apply(ctx, payload) {
    const existing = ctx.tx
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(eq(schema.activities.id, payload.activityId))
      .get();
    if (existing) {
      // The mutation-id dedupe upstream handles replays; a *different*
      // mutation reusing an entity id is a client bug.
      throw new MutationError(409, "activity_exists", "activity id already in use");
    }

    ctx.tx
      .insert(schema.activities)
      .values({
        id: payload.activityId,
        tripId: ctx.trip.id,
        date: payload.date,
        position: payload.position,
        title: payload.title,
        startTime: payload.startTime,
        endTime: payload.endTime,
        placeName: payload.place?.name ?? null,
        address: payload.place?.address ?? null,
        lat: payload.place?.lat ?? null,
        lng: payload.place?.lng ?? null,
        placeProvider: payload.place?.provider ?? null,
        placeRef: payload.place?.ref ?? null,
        category: payload.category,
        notes: payload.notes,
        linkUrl: payload.linkUrl,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .run();

    return {
      entityType: "activity",
      entityId: payload.activityId,
      feedPayload: { title: payload.title, date: payload.date },
    };
  },
});

registerMutation("activity.update", {
  role: "editor",
  apply(ctx, payload) {
    const activity = loadActivity(ctx, payload.activityId);
    const { place, ...fields } = payload.patch;

    const update: Partial<typeof schema.activities.$inferInsert> = {
      ...fields,
      updatedAt: ctx.now,
    };
    if (place !== undefined) {
      update.placeName = place?.name ?? null;
      update.address = place?.address ?? null;
      update.lat = place?.lat ?? null;
      update.lng = place?.lng ?? null;
      update.placeProvider = place?.provider ?? null;
      update.placeRef = place?.ref ?? null;
    }

    // Cross-field guard on the merged record: times must stay ordered.
    const merged = { ...activity, ...update };
    if (merged.startTime && merged.endTime && merged.startTime > merged.endTime) {
      throw new MutationError(400, "invalid_times", "endTime must not be before startTime");
    }

    ctx.tx
      .update(schema.activities)
      .set(update)
      .where(eq(schema.activities.id, activity.id))
      .run();

    return {
      entityType: "activity",
      entityId: activity.id,
      feedPayload: {
        title: fields.title ?? activity.title,
        fields: Object.keys(payload.patch),
      },
    };
  },
});

registerMutation("activity.move", {
  role: "editor",
  apply(ctx, payload) {
    const activity = loadActivity(ctx, payload.activityId);

    ctx.tx
      .update(schema.activities)
      .set({ date: payload.date, position: payload.position, updatedAt: ctx.now })
      .where(eq(schema.activities.id, activity.id))
      .run();

    return {
      entityType: "activity",
      entityId: activity.id,
      feedPayload: { title: activity.title, fromDate: activity.date, toDate: payload.date },
    };
  },
});

registerMutation("activity.delete", {
  role: "editor",
  apply(ctx, payload) {
    const activity = loadActivity(ctx, payload.activityId);
    ctx.tx.delete(schema.activities).where(eq(schema.activities.id, activity.id)).run();
    return {
      entityType: "activity",
      entityId: activity.id,
      // The feed snapshot is what preserves history after a hard delete.
      feedPayload: { title: activity.title, date: activity.date },
    };
  },
});

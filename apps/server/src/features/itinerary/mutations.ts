import type { ChecklistItem } from "@caravan/shared";
import { and, eq } from "drizzle-orm";
import { type MutationCtx, MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Itinerary mutations (M1.6): the first — and semantically richest —
 * consumers of the pipeline. Per-field LWW on update; date+position move as
 * one atomic pair so the canonical concurrent conflict (two members moving
 * the same activity) converges to a single winner (TD-1/PD-5).
 *
 * Trip Workspace v2 (D1/D7/D10) layers typed items onto the same row: a `type`
 * discriminator, an `estimatedCostMinor`, an idea-list `listId`, and a
 * checklist body. `checklist.toggle` flips one item by id so concurrent toggles
 * converge in the transaction (vs. a whole-array replace that would clobber).
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

/** An idea (activity.listId) may only point at a list on the SAME trip (D10). */
function assertListInTrip(ctx: MutationCtx, listId: string): void {
  const list = ctx.tx
    .select({ id: schema.ideaLists.id })
    .from(schema.ideaLists)
    .where(and(eq(schema.ideaLists.id, listId), eq(schema.ideaLists.tripId, ctx.trip.id)))
    .get();
  if (!list) throw new MutationError(400, "unknown_list", "idea list is not on this trip");
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

    // D10: an idea may carry a list, but only one on this trip.
    if (payload.listId !== null) assertListInTrip(ctx, payload.listId);

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
        // Trip Workspace v2 typed-item fields (the create payload guards
        // flight/lodging and checklist-only items at the schema level).
        type: payload.type,
        estimatedCostMinor: payload.estimatedCostMinor,
        listId: payload.listId,
        checklistItems: payload.checklistItems ? JSON.stringify(payload.checklistItems) : null,
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
    // `checklistItems` is a typed array on the wire but a JSON text column; pull
    // it out of the flat-field spread and serialize it explicitly below.
    const { place, checklistItems, ...fields } = payload.patch;

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
    if (checklistItems !== undefined) {
      update.checklistItems = checklistItems ? JSON.stringify(checklistItems) : null;
    }
    // D10: re-assigning to a list validates it belongs to this trip (null clears).
    if (fields.listId !== undefined && fields.listId !== null) {
      assertListInTrip(ctx, fields.listId);
    }

    // Cross-field guard on the merged record: times must stay ordered.
    const merged = { ...activity, ...update };
    if (merged.startTime && merged.endTime && merged.startTime > merged.endTime) {
      throw new MutationError(400, "invalid_times", "endTime must not be before startTime");
    }

    ctx.tx.update(schema.activities).set(update).where(eq(schema.activities.id, activity.id)).run();

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

/**
 * D1 per-item checklist toggle. Read-modify-write a single entry by id inside
 * the transaction so two members toggling DIFFERENT items both stick (the
 * second sees the first's write) — the collaborative-correctness bar a
 * whole-array `activity.update` can't meet. The post-image is the activity
 * itself (entityType `activity`), so clients apply the new array surgically.
 */
registerMutation("checklist.toggle", {
  role: "editor",
  apply(ctx, payload) {
    const activity = loadActivity(ctx, payload.activityId);
    if (activity.type !== "checklist") {
      throw new MutationError(400, "not_a_checklist", "activity is not a checklist");
    }
    const items: ChecklistItem[] = activity.checklistItems
      ? (JSON.parse(activity.checklistItems) as ChecklistItem[])
      : [];
    const item = items.find((i) => i.id === payload.itemId);
    if (!item) {
      throw new MutationError(404, "checklist_item_not_found", "checklist item not found");
    }
    item.done = payload.done;

    ctx.tx
      .update(schema.activities)
      .set({ checklistItems: JSON.stringify(items), updatedAt: ctx.now })
      .where(eq(schema.activities.id, activity.id))
      .run();

    return {
      entityType: "activity",
      entityId: activity.id,
      feedPayload: { title: activity.title, item: item.text, done: payload.done },
    };
  },
});

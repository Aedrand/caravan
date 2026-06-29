import { and, eq } from "drizzle-orm";
import { registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * First-class day metadata (D2, Trip Workspace v2). `day.upsert` is a lazy
 * find-or-create keyed by `(tripId, date)`: it sets the day's metadata whether
 * or not a row exists yet. Different days are different rows (no cross-day
 * clobber); concurrent edits to the SAME day's subtitle are per-field LWW on
 * that one row — the same semantics as an activity edit.
 *
 * The unique `days_trip_date` index resolves the create race: if two clients
 * both believe the day has no row and send different `dayId`s, only the first
 * INSERTs; the second finds the now-existing row and updates it instead.
 */
registerMutation("day.upsert", {
  role: "editor",
  apply(ctx, payload) {
    // Each metadata field is independently optional (V2.4 home-base override):
    // an absent key leaves that column untouched; a present `null` clears it.
    // `homeBasePlace` fans out to the six `home_base_*` columns. `fields` mirrors
    // exactly which metadata this write touched, for the feed copy.
    const values: Partial<typeof schema.days.$inferInsert> = {};
    const fields: string[] = [];
    if (payload.subtitle !== undefined) {
      values.subtitle = payload.subtitle;
      fields.push("subtitle");
    }
    if (payload.homeBasePlace !== undefined) {
      const p = payload.homeBasePlace;
      values.homeBasePlaceName = p?.name ?? null;
      values.homeBaseAddress = p?.address ?? null;
      values.homeBaseLat = p?.lat ?? null;
      values.homeBaseLng = p?.lng ?? null;
      values.homeBasePlaceProvider = p?.provider ?? null;
      values.homeBasePlaceRef = p?.ref ?? null;
      fields.push("homeBase");
    }

    const existing = ctx.tx
      .select()
      .from(schema.days)
      .where(and(eq(schema.days.tripId, ctx.trip.id), eq(schema.days.date, payload.date)))
      .get();

    if (existing) {
      // Found → patch only the provided metadata; never touch other days, and
      // don't reset createdAt/createdBy.
      ctx.tx
        .update(schema.days)
        .set({ ...values, updatedAt: ctx.now })
        .where(eq(schema.days.id, existing.id))
        .run();
      return {
        entityType: "day",
        entityId: existing.id,
        feedPayload: { date: payload.date, fields },
      };
    }

    ctx.tx
      .insert(schema.days)
      .values({
        id: payload.dayId,
        tripId: ctx.trip.id,
        date: payload.date,
        // Omitted nullable columns default to NULL — only the touched metadata is set.
        ...values,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .run();
    return {
      entityType: "day",
      entityId: payload.dayId,
      feedPayload: { date: payload.date, fields },
    };
  },
});

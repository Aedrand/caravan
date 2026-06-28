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
    const existing = ctx.tx
      .select()
      .from(schema.days)
      .where(and(eq(schema.days.tripId, ctx.trip.id), eq(schema.days.date, payload.date)))
      .get();

    if (existing) {
      // Found → patch only the provided metadata (subtitle); never touch other
      // days, and don't reset createdAt/createdBy.
      ctx.tx
        .update(schema.days)
        .set({ subtitle: payload.subtitle, updatedAt: ctx.now })
        .where(eq(schema.days.id, existing.id))
        .run();
      return {
        entityType: "day",
        entityId: existing.id,
        feedPayload: { date: payload.date, fields: ["subtitle"] },
      };
    }

    ctx.tx
      .insert(schema.days)
      .values({
        id: payload.dayId,
        tripId: ctx.trip.id,
        date: payload.date,
        subtitle: payload.subtitle,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .run();
    return {
      entityType: "day",
      entityId: payload.dayId,
      feedPayload: { date: payload.date, fields: ["subtitle"] },
    };
  },
});

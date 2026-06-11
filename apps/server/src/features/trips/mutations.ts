import { eq } from "drizzle-orm";
import { MutationError, registerMutation } from "../../core/mutations";
import { schema } from "../../db";

/**
 * Trip mutations (M1.1): metadata edits plus the archive/unarchive pair.
 * Archive is the only soft state a trip carries — the pipeline itself turns
 * an archived trip read-only, so unarchive is the lone allowArchived escape
 * hatch (TD-1).
 */

registerMutation("trip.update", {
  role: "editor",
  apply(ctx, payload) {
    // Cross-field guard on the MERGED row: the payload refinement only sees
    // dates that travel together; a lone endDate must still respect the
    // startDate already on the trip.
    const merged = { ...ctx.trip, ...payload };
    if (merged.startDate && merged.endDate && merged.startDate > merged.endDate) {
      throw new MutationError(400, "invalid_dates", "endDate must not be before startDate");
    }

    ctx.tx
      .update(schema.trips)
      .set({ ...payload, updatedAt: ctx.now })
      .where(eq(schema.trips.id, ctx.trip.id))
      .run();

    return {
      entityType: "trip",
      entityId: ctx.trip.id,
      feedPayload: { fields: Object.keys(payload) },
    };
  },
});

registerMutation("trip.archive", {
  role: "owner",
  apply(ctx) {
    // The pipeline rejects mutations on archived trips, so a double-archive
    // can never reach this handler.
    ctx.tx
      .update(schema.trips)
      .set({ archivedAt: ctx.now })
      .where(eq(schema.trips.id, ctx.trip.id))
      .run();

    return { entityType: "trip", entityId: ctx.trip.id, feedPayload: {} };
  },
});

registerMutation("trip.unarchive", {
  role: "owner",
  allowArchived: true,
  apply(ctx) {
    if (ctx.trip.archivedAt === null) {
      throw new MutationError(409, "trip_not_archived", "trip is not archived");
    }

    ctx.tx
      .update(schema.trips)
      .set({ archivedAt: null })
      .where(eq(schema.trips.id, ctx.trip.id))
      .run();

    return { entityType: "trip", entityId: ctx.trip.id, feedPayload: {} };
  },
});

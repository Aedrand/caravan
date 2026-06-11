import { CreateTripSchema } from "@caravan/shared";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthedEnv } from "../../auth/session";
import { getActiveMember } from "../../core/membership";
import { serializeInvite, serializeTrip } from "../../core/serialize";
import type { Db } from "../../db";
import { schema } from "../../db";
import type { Logger } from "../../logger";
import { createTrip, duplicateTrip } from "./service";

/**
 * Trip CRUD routes (M1.1), mounted at /api/trips behind requireUser.
 * Create/duplicate/delete are whole-trip operations outside the mutation
 * pipeline; everything inside a trip mutates via /:tripId/mutations.
 */
export function createTripsRoutes(deps: { db: Db; logger: Logger }) {
  const { db, logger } = deps;

  return (
    new Hono<AuthedEnv>()
      .post("/", async (c) => {
        let body: unknown;
        try {
          body = await c.req.json();
        } catch {
          return c.json(
            { error: { code: "invalid_json", message: "request body must be JSON" } },
            400,
          );
        }
        const parsed = CreateTripSchema.safeParse(body);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "invalid body";
          return c.json({ error: { code: "invalid_body", message } }, 400);
        }

        const { trip } = createTrip(db, {
          userId: c.get("user").id,
          input: parsed.data,
          now: Date.now(),
        });
        logger.info({ tripId: trip.id, userId: c.get("user").id }, "trip created");
        return c.json({ trip: serializeTrip(trip) }, 201);
      })

      .get("/", (c) => {
        const userId = c.get("user").id;

        const rows = db
          .select({ trip: schema.trips, role: schema.tripMembers.role })
          .from(schema.tripMembers)
          .innerJoin(schema.trips, eq(schema.trips.id, schema.tripMembers.tripId))
          .where(
            and(eq(schema.tripMembers.userId, userId), eq(schema.tripMembers.status, "active")),
          )
          .orderBy(desc(schema.trips.updatedAt))
          .all();
        if (rows.length === 0) return c.json({ trips: [] });

        const counts = db
          .select({ tripId: schema.tripMembers.tripId, memberCount: count() })
          .from(schema.tripMembers)
          .where(
            and(
              inArray(
                schema.tripMembers.tripId,
                rows.map((r) => r.trip.id),
              ),
              eq(schema.tripMembers.status, "active"),
            ),
          )
          .groupBy(schema.tripMembers.tripId)
          .all();
        const countByTrip = new Map(counts.map((r) => [r.tripId, r.memberCount]));

        return c.json({
          trips: rows.map((r) => ({
            trip: serializeTrip(r.trip),
            role: r.role,
            memberCount: countByTrip.get(r.trip.id) ?? 1,
          })),
        });
      })

      .delete("/:tripId", (c) => {
        const tripId = c.req.param("tripId");
        const trip = db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
        if (!trip) {
          return c.json({ error: { code: "trip_not_found", message: "trip not found" } }, 404);
        }
        const member = getActiveMember(db, tripId, c.get("user").id);
        if (!member) {
          return c.json(
            { error: { code: "not_a_member", message: "you are not a member of this trip" } },
            403,
          );
        }
        if (member.role !== "owner") {
          return c.json(
            { error: { code: "owner_only", message: "only the owner can delete a trip" } },
            403,
          );
        }

        // FKs cascade: members, invites, activities, and feed events go with it.
        db.delete(schema.trips).where(eq(schema.trips.id, tripId)).run();
        logger.info({ tripId, userId: c.get("user").id }, "trip deleted");
        return c.json({ ok: true });
      })

      .post("/:tripId/duplicate", (c) => {
        const tripId = c.req.param("tripId");
        const trip = db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
        if (!trip) {
          return c.json({ error: { code: "trip_not_found", message: "trip not found" } }, 404);
        }
        const member = getActiveMember(db, tripId, c.get("user").id);
        if (!member) {
          return c.json(
            { error: { code: "not_a_member", message: "you are not a member of this trip" } },
            403,
          );
        }

        const { trip: newTrip } = duplicateTrip(db, {
          userId: c.get("user").id,
          sourceTripId: tripId,
          now: Date.now(),
        });
        logger.info({ sourceTripId: tripId, tripId: newTrip.id }, "trip duplicated");
        return c.json({ trip: serializeTrip(newTrip) }, 201);
      })

      // Owner-only: invites carry instance access (PD-10), so even the list of
      // live links stays off other members' wires. Tokens are never listable.
      .get("/:tripId/invites", (c) => {
        const tripId = c.req.param("tripId");
        const trip = db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
        if (!trip) {
          return c.json({ error: { code: "trip_not_found", message: "trip not found" } }, 404);
        }
        const member = getActiveMember(db, tripId, c.get("user").id);
        if (!member) {
          return c.json(
            { error: { code: "not_a_member", message: "you are not a member of this trip" } },
            403,
          );
        }
        if (member.role !== "owner") {
          return c.json(
            { error: { code: "owner_only", message: "only the owner manages invites" } },
            403,
          );
        }
        const now = Date.now();
        const invites = db
          .select()
          .from(schema.inviteLinks)
          .where(eq(schema.inviteLinks.tripId, tripId))
          .all()
          // Same liveness rule as findValidInvite — expired links are as dead
          // as revoked ones and must not look shareable in the panel.
          .filter(
            (row) => row.revokedAt === null && (row.expiresAt === null || row.expiresAt > now),
          )
          .map(serializeInvite);
        return c.json({ invites });
      })
  );
}

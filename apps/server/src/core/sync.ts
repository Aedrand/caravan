import {
  ClientWsMessageSchema,
  createId,
  type Mutation,
  parseMutation,
  type ServerWsMessage,
  type TripSnapshot,
} from "@caravan/shared";
import type { upgradeWebSocket as nodeUpgradeWebSocket } from "@hono/node-server";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { SessionUser } from "../auth/session";
import type { Db } from "../db";
import { schema } from "../db";
import type { Logger } from "../logger";
import { getActiveMember } from "./membership";
import { eventsSince, executeMutation, MutationError } from "./mutations";
import { serializeActivity, serializeMember, serializeTrip } from "./serialize";
import type { createTripRooms } from "./ws";

/**
 * The sync HTTP surface (M1.3, plan §3.3): mutations in, snapshot + events
 * out, and the WS upgrade for live fan-out. Mounted by the app under
 * /api/trips behind requireUser, so `user` is always present here.
 */

type TripRow = typeof schema.trips.$inferSelect;
type MemberRow = typeof schema.tripMembers.$inferSelect;

/** `user` is set by the parent's requireUser; `trip`/`member` by tripMember below. */
export type SyncEnv = {
  Variables: {
    user: SessionUser;
    trip: TripRow;
    member: MemberRow;
  };
};

export interface SyncDeps {
  db: Db;
  rooms: ReturnType<typeof createTripRooms>;
  logger: Logger;
  upgradeWebSocket: typeof nodeUpgradeWebSocket;
}

const SinceSchema = z.coerce.number().int().nonnegative();

export function createSyncRoutes({ db, rooms, logger, upgradeWebSocket }: SyncDeps) {
  /**
   * Trip + active-membership gate for every sync route. Runs BEFORE the WS
   * upgrade too: cookies ride the upgrade request, so auth and membership
   * behave identically for HTTP and WS.
   */
  const tripMember = createMiddleware<SyncEnv>(async (c, next) => {
    const tripId = c.req.param("tripId") ?? "";
    const trip = db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
    if (!trip) {
      return c.json({ error: { code: "trip_not_found", message: "trip not found" } }, 404);
    }
    const member = getActiveMember(db, trip.id, c.get("user").id);
    if (!member) {
      return c.json(
        { error: { code: "not_a_member", message: "you are not a member of this trip" } },
        403,
      );
    }
    c.set("trip", trip);
    c.set("member", member);
    await next();
  });

  return new Hono<SyncEnv>()
    .use("/:tripId/*", tripMember)

    .post("/:tripId/mutations", async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          { error: { code: "invalid_json", message: "request body must be valid JSON" } },
          400,
        );
      }

      let mutation: Mutation;
      try {
        mutation = parseMutation(body);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const message = err.issues[0]?.message ?? "invalid mutation";
          return c.json({ error: { code: "invalid_mutation", message } }, 400);
        }
        throw err;
      }

      try {
        const response = executeMutation(
          { db, broadcast: rooms.broadcastEvent },
          {
            tripId: c.get("trip").id,
            actor: { userId: c.get("user").id, type: "user" },
            mutation,
          },
        );
        return c.json(response);
      } catch (err) {
        if (err instanceof MutationError) {
          return c.json({ error: { code: err.code, message: err.message } }, err.status);
        }
        throw err;
      }
    })

    .get("/:tripId/snapshot", (c) => {
      const trip = c.get("trip");
      // ALL members, ghosts included — history needs their names (PD-9).
      const memberRows = db
        .select({ member: schema.tripMembers, userName: schema.user.name })
        .from(schema.tripMembers)
        .innerJoin(schema.user, eq(schema.user.id, schema.tripMembers.userId))
        .where(eq(schema.tripMembers.tripId, trip.id))
        .all();
      const activityRows = db
        .select()
        .from(schema.activities)
        .where(eq(schema.activities.tripId, trip.id))
        .orderBy(asc(schema.activities.position), asc(schema.activities.id))
        .all();

      const snapshot: TripSnapshot = {
        trip: serializeTrip(trip),
        members: memberRows.map((row) => serializeMember(row.member, row.userName)),
        activities: activityRows.map(serializeActivity),
      };
      return c.json(snapshot);
    })

    .get("/:tripId/events", (c) => {
      const since = SinceSchema.safeParse(c.req.query("since"));
      if (!since.success) {
        return c.json(
          { error: { code: "invalid_since", message: "since must be a nonnegative integer" } },
          400,
        );
      }
      return c.json({ events: eventsSince(db, c.get("trip").id, since.data) });
    })

    .get("/:tripId/ws", (c, next) => {
      const user = c.get("user");
      const trip = c.get("trip");
      const member = c.get("member");
      const connId = createId();

      const upgrade = upgradeWebSocket(() => ({
        onOpen: (_evt, ws) => {
          // Fresh read — the version may have moved since tripMember loaded the row.
          const fresh = db.select().from(schema.trips).where(eq(schema.trips.id, trip.id)).get();
          const hello: ServerWsMessage = { kind: "hello", version: fresh?.version ?? trip.version };
          try {
            ws.send(JSON.stringify(hello));
          } catch (err) {
            logger.warn({ err, tripId: trip.id, connId }, "ws hello send failed");
          }
          rooms.join(trip.id, { id: connId, memberId: member.id, name: user.name, ws });
        },
        onMessage: (evt) => {
          if (typeof evt.data !== "string") return;
          let raw: unknown;
          try {
            raw = JSON.parse(evt.data);
          } catch {
            return; // not JSON — ignore
          }
          const parsed = ClientWsMessageSchema.safeParse(raw);
          if (!parsed.success) return; // unknown shape — ignore
          rooms.updatePresence(trip.id, connId, parsed.data.view);
        },
        onClose: () => rooms.leave(trip.id, connId),
        onError: () => rooms.leave(trip.id, connId),
      }));

      return upgrade(c, next);
    });
}

export type SyncRoutes = ReturnType<typeof createSyncRoutes>;

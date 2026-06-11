import { eq } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import type { AuthedEnv } from "../../auth/session";
import { MutationError } from "../../core/mutations";
import type { TripRooms } from "../../core/ws";
import type { Db } from "../../db";
import { schema } from "../../db";
import type { Logger } from "../../logger";
import { findValidInvite } from "./invites";
import { joinTrip } from "./join";

export interface InviteRoutesDeps {
  db: Db;
  rooms: TripRooms;
  logger: Logger;
  /** Session gate for the accept route only — GET info is public by design (PD-10). */
  requireUser: MiddlewareHandler<AuthedEnv>;
}

/**
 * The invite door (M1.5): mounted at /api/invites.
 * GET /:token shows where the link leads BEFORE asking anyone to sign in or
 * register; POST /:token/accept turns a session into a membership. Invalid,
 * revoked, and expired tokens are indistinguishable on the wire.
 */
export function createInviteRoutes({ db, rooms, logger, requireUser }: InviteRoutesDeps) {
  return new Hono<AuthedEnv>()
    .get("/:token", (c) => {
      const invite = findValidInvite(db, c.req.param("token"), Date.now());
      if (!invite) {
        return c.json(
          { error: { code: "invite_invalid", message: "This invite link is no longer valid" } },
          404,
        );
      }
      const trip = db
        .select({ name: schema.trips.name, destination: schema.trips.destination })
        .from(schema.trips)
        .where(eq(schema.trips.id, invite.tripId))
        .get();
      if (!trip) {
        return c.json(
          { error: { code: "invite_invalid", message: "This invite link is no longer valid" } },
          404,
        );
      }
      return c.json({ trip, role: invite.role });
    })
    .post("/:token/accept", requireUser, (c) => {
      const invite = findValidInvite(db, c.req.param("token"), Date.now());
      if (!invite) {
        return c.json(
          { error: { code: "invite_invalid", message: "This invite link is no longer valid" } },
          404,
        );
      }
      const user = c.get("user");
      try {
        const result = joinTrip(db, {
          userId: user.id,
          invite,
          now: Date.now(),
          broadcast: rooms.broadcastEvent,
        });
        logger.info(
          { tripId: result.tripId, memberId: result.memberId, outcome: result.outcome },
          "invite accepted",
        );
        return c.json(result);
      } catch (err) {
        if (err instanceof MutationError) {
          return c.json({ error: { code: err.code, message: err.message } }, err.status);
        }
        throw err;
      }
    });
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId, type Mutation } from "@caravan/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import pino from "pino";
import { afterEach, expect, test, vi } from "vitest";
import type { AuthedEnv, SessionUser } from "../../auth/session";
import { type Actor, executeMutation } from "../../core/mutations";
import { createTripRooms } from "../../core/ws";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import { createInviteRoutes } from "./invite-routes";
import { joinTrip } from "./join";
import "./membership"; // invite.create — used to mint real invites

const logger = pino({ level: "silent" });
const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-join-"));
  tempDirs.push(dir);
  const { db } = createDb(path.join(dir, "test.db"));
  runMigrations(db);

  const insertUser = (name: string) => {
    const id = createId();
    db.insert(schema.user)
      .values({
        id,
        name,
        email: `${name.toLowerCase()}-${id.slice(0, 8)}@example.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    return id;
  };

  const insertTrip = (ownerUserId: string) => {
    const tripId = createId();
    const now = Date.now();
    db.insert(schema.trips)
      .values({
        id: tripId,
        name: "Test Trip",
        currency: "USD",
        version: 0,
        createdBy: ownerUserId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const memberId = createId();
    db.insert(schema.tripMembers)
      .values({
        id: memberId,
        tripId,
        userId: ownerUserId,
        role: "owner",
        status: "active",
        joinedAt: now,
        updatedAt: now,
      })
      .run();
    return { tripId, memberId };
  };

  /** Mint a real invite through the pipeline; returns the raw token + row. */
  const mintInvite = (
    tripId: string,
    ownerUserId: string,
    role: "editor" | "viewer" = "editor",
  ) => {
    const actor: Actor = { userId: ownerUserId, type: "user" };
    const res = executeMutation(
      { db },
      {
        tripId,
        actor,
        mutation: {
          id: createId(),
          type: "invite.create",
          payload: { role, expiresAt: null },
        } as Mutation,
      },
    );
    const token = (res.result as { token: string }).token;
    const row = db
      .select()
      .from(schema.inviteLinks)
      .where(eq(schema.inviteLinks.id, res.event.entityId))
      .get();
    if (!row) throw new Error("invite row missing");
    return { token, row };
  };

  return { db, insertUser, insertTrip, mintInvite };
}

test("joinTrip: new user becomes a member; member.join event bumps version and broadcasts", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const joiner = h.insertUser("Joiner");
  const { tripId } = h.insertTrip(owner);
  const { row: invite } = h.mintInvite(tripId, owner, "viewer"); // version → 1
  const broadcast = vi.fn();

  const result = joinTrip(h.db, { userId: joiner, invite, now: Date.now(), broadcast });
  expect(result.outcome).toBe("joined");

  const member = h.db
    .select()
    .from(schema.tripMembers)
    .where(eq(schema.tripMembers.id, result.memberId))
    .get();
  expect(member).toMatchObject({ userId: joiner, role: "viewer", status: "active" });

  const trip = h.db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
  expect(trip?.version).toBe(2);

  expect(broadcast).toHaveBeenCalledTimes(1);
  const [calledTripId, event, entity] = broadcast.mock.calls[0] ?? [];
  expect(calledTripId).toBe(tripId);
  expect(event).toMatchObject({
    type: "member.join",
    entityType: "member",
    version: 2,
    payload: { name: "Joiner", role: "viewer" },
  });
  expect(entity).toMatchObject({ id: result.memberId, name: "Joiner", role: "viewer" });
});

test("joinTrip: ghost rejoin reattaches the SAME membership row with the invite's role (PD-9)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const rejoiner = h.insertUser("Rejoiner");
  const { tripId } = h.insertTrip(owner);
  const { row: invite } = h.mintInvite(tripId, owner, "editor");

  // a prior life: joined long ago, then left
  const originalJoinedAt = 1_000_000;
  const ghostMemberId = createId();
  h.db
    .insert(schema.tripMembers)
    .values({
      id: ghostMemberId,
      tripId,
      userId: rejoiner,
      role: "viewer",
      status: "ghost",
      joinedAt: originalJoinedAt,
      updatedAt: originalJoinedAt,
    })
    .run();

  const result = joinTrip(h.db, { userId: rejoiner, invite, now: Date.now() });
  expect(result).toMatchObject({ memberId: ghostMemberId, outcome: "rejoined" });

  const member = h.db
    .select()
    .from(schema.tripMembers)
    .where(eq(schema.tripMembers.id, ghostMemberId))
    .get();
  // same row, invite's role, original join date — history reattaches
  expect(member).toMatchObject({
    status: "active",
    role: "editor",
    joinedAt: originalJoinedAt,
  });
});

test("joinTrip: an active member re-clicking the link is a no-op (no event, no bump)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId, memberId } = h.insertTrip(owner);
  const { row: invite } = h.mintInvite(tripId, owner); // version → 1
  const broadcast = vi.fn();

  const result = joinTrip(h.db, { userId: owner, invite, now: Date.now(), broadcast });
  expect(result).toMatchObject({ memberId, outcome: "already_member" });
  expect(broadcast).not.toHaveBeenCalled();
  expect(h.db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get()?.version).toBe(
    1,
  );
});

test("joinTrip: archived trips don't accept new members", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const joiner = h.insertUser("Joiner");
  const { tripId } = h.insertTrip(owner);
  const { row: invite } = h.mintInvite(tripId, owner);
  h.db
    .update(schema.trips)
    .set({ archivedAt: Date.now() })
    .where(eq(schema.trips.id, tripId))
    .run();

  expect(() => joinTrip(h.db, { userId: joiner, invite, now: Date.now() })).toThrowError(
    expect.objectContaining({ status: 409, code: "trip_archived" }),
  );
});

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

function routesApp(h: ReturnType<typeof harness>, current: { user: SessionUser | null }) {
  const rooms = createTripRooms(logger);
  const stubRequireUser = createMiddleware<AuthedEnv>(async (c, next) => {
    if (!current.user) {
      return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
    }
    c.set("user", current.user);
    await next();
  });
  return new Hono().route(
    "/api/invites",
    createInviteRoutes({ db: h.db, rooms, logger, requireUser: stubRequireUser }),
  );
}

test("invite routes: GET shows the destination; accept joins; invalid tokens 404 uniformly", async () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const joinerUserId = h.insertUser("Joiner");
  const { tripId } = h.insertTrip(owner);
  const { token, row } = h.mintInvite(tripId, owner, "editor");

  const current: { user: SessionUser | null } = { user: null };
  const app = routesApp(h, current);

  // public info, no session needed
  const info = await app.request(`/api/invites/${token}`);
  expect(info.status).toBe(200);
  expect(await info.json()).toEqual({
    trip: { name: "Test Trip", destination: null },
    role: "editor",
  });

  // accept requires a session
  expect((await app.request(`/api/invites/${token}/accept`, { method: "POST" })).status).toBe(401);

  current.user = { id: joinerUserId, name: "Joiner", email: "j@example.com", role: "member" };
  const accept = await app.request(`/api/invites/${token}/accept`, { method: "POST" });
  expect(accept.status).toBe(200);
  expect(await accept.json()).toMatchObject({ tripId, outcome: "joined" });

  // revoked → same 404 envelope as garbage tokens
  h.db
    .update(schema.inviteLinks)
    .set({ revokedAt: Date.now() })
    .where(eq(schema.inviteLinks.id, row.id))
    .run();
  const revoked = await app.request(`/api/invites/${token}`);
  const garbage = await app.request("/api/invites/definitely-not-a-token");
  expect(revoked.status).toBe(404);
  expect(garbage.status).toBe(404);
  const envelope = (res: unknown) => (res as { error: { code: string } }).error.code;
  expect(envelope(await revoked.json())).toBe("invite_invalid");
  expect(envelope(await garbage.json())).toBe("invite_invalid");
});

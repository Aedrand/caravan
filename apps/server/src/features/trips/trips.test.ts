import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CreateTripSchema,
  createId,
  firstPosition,
  parseMutation,
  TripListItemSchema,
} from "@caravan/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import pino from "pino";
import { afterEach, expect, test } from "vitest";
import type { AuthedEnv, SessionUser } from "../../auth/session";
import { executeMutation } from "../../core/mutations";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import "./mutations"; // registers trip.* handlers
import { createTripsRoutes } from "./routes";
import { createTrip, duplicateTrip } from "./service";

const logger = pino({ level: "silent" });
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-trips-"));
  tempDirs.push(dir);
  const { db } = createDb(path.join(dir, "test.db"));
  runMigrations(db);

  const insertUser = (name: string) => {
    const id = createId();
    db.insert(schema.user)
      .values({
        id,
        name,
        email: `${name.toLowerCase()}-${id.slice(0, 6)}@example.com`,
        emailVerified: false,
        role: "member",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    return id;
  };

  const insertTrip = (
    ownerUserId: string,
    overrides: Partial<typeof schema.trips.$inferInsert> = {},
  ) => {
    const tripId = createId();
    const now = Date.now();
    db.insert(schema.trips)
      .values({
        id: tripId,
        name: "Test Trip",
        currency: "USD",
        createdBy: ownerUserId,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .run();
    const memberId = addMember(tripId, ownerUserId, "owner");
    return { tripId, memberId };
  };

  const addMember = (
    tripId: string,
    userId: string,
    role: "owner" | "editor" | "viewer",
    status: "active" | "ghost" = "active",
  ) => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.tripMembers)
      .values({ id, tripId, userId, role, status, joinedAt: now, updatedAt: now })
      .run();
    return id;
  };

  const insertActivity = (
    tripId: string,
    createdBy: string,
    overrides: Partial<typeof schema.activities.$inferInsert> = {},
  ) => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.activities)
      .values({
        id,
        tripId,
        date: "2026-07-04",
        position: firstPosition(),
        title: "Sunrise hike",
        createdBy,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .run();
    return id;
  };

  return { db, insertUser, insertTrip, addMember, insertActivity };
}

function tripMutation(
  type: "trip.update" | "trip.archive" | "trip.unarchive",
  payload: Record<string, unknown> = {},
) {
  return parseMutation({ id: createId(), type, payload });
}

function getTrip(h: ReturnType<typeof harness>, tripId: string) {
  return h.db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).get();
}

// ---------------------------------------------------------------------------
// mutation handlers (via executeMutation)
// ---------------------------------------------------------------------------

test("trip.update: patches fields, bumps version, records an attributed feed event", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId, memberId } = h.insertTrip(owner);

  const res = executeMutation(
    { db: h.db },
    {
      tripId,
      actor: { userId: owner, type: "user" },
      mutation: tripMutation("trip.update", { name: "Renamed", destination: "Lisbon" }),
    },
  );

  expect(res.version).toBe(1);
  expect(res.event.actorMemberId).toBe(memberId);
  expect(res.event.entityType).toBe("trip");
  expect(res.event.entityId).toBe(tripId);
  const fields = (res.event.payload as { fields: string[] }).fields;
  expect([...fields].sort()).toEqual(["destination", "name"]);

  const row = getTrip(h, tripId);
  expect(row?.name).toBe("Renamed");
  expect(row?.destination).toBe("Lisbon");
  expect(row?.version).toBe(1);
  expect(h.db.select().from(schema.feedEvents).all()).toHaveLength(1);
});

test("trip.update: merged-date guard rejects an endDate before the existing startDate", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  h.db
    .update(schema.trips)
    .set({ startDate: "2026-07-10" })
    .where(eq(schema.trips.id, tripId))
    .run();
  const actor = { userId: owner, type: "user" as const };

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor, mutation: tripMutation("trip.update", { endDate: "2026-07-01" }) },
    ),
  ).toThrowError(expect.objectContaining({ status: 400, code: "invalid_dates" }));

  // an endDate after the existing startDate passes the merged guard
  const ok = executeMutation(
    { db: h.db },
    { tripId, actor, mutation: tripMutation("trip.update", { endDate: "2026-07-20" }) },
  );
  expect(ok.version).toBe(1);
  expect(getTrip(h, tripId)?.endDate).toBe("2026-07-20");
});

test("trip.update: viewers are rejected with insufficient_role", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const viewer = h.insertUser("Viewer");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, viewer, "viewer");

  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: { userId: viewer, type: "user" },
        mutation: tripMutation("trip.update", { name: "Hijacked" }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 403, code: "insufficient_role" }));
});

test("trip.archive blocks subsequent mutations; trip.unarchive restores writability", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editor, "editor");
  const asOwner = { userId: owner, type: "user" as const };

  // archive is owner-only
  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: { userId: editor, type: "user" }, mutation: tripMutation("trip.archive") },
    ),
  ).toThrowError(expect.objectContaining({ status: 403, code: "insufficient_role" }));

  const archived = executeMutation(
    { db: h.db },
    { tripId, actor: asOwner, mutation: tripMutation("trip.archive") },
  );
  expect(archived.version).toBe(1);
  expect(getTrip(h, tripId)?.archivedAt).not.toBeNull();

  // the pipeline now rejects everything that is not allowArchived
  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: asOwner, mutation: tripMutation("trip.update", { name: "Nope" }) },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "trip_archived" }));

  const unarchived = executeMutation(
    { db: h.db },
    { tripId, actor: asOwner, mutation: tripMutation("trip.unarchive") },
  );
  expect(unarchived.version).toBe(2);
  expect(getTrip(h, tripId)?.archivedAt).toBeNull();

  const update = executeMutation(
    { db: h.db },
    { tripId, actor: asOwner, mutation: tripMutation("trip.update", { name: "Back" }) },
  );
  expect(update.version).toBe(3);
  expect(getTrip(h, tripId)?.name).toBe("Back");
});

test("trip.unarchive on a live trip is a 409 trip_not_archived", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: { userId: owner, type: "user" }, mutation: tripMutation("trip.unarchive") },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "trip_not_archived" }));
});

// ---------------------------------------------------------------------------
// service
// ---------------------------------------------------------------------------

test("createTrip: trip + owner membership created together with the given clock", () => {
  const h = harness();
  const userId = h.insertUser("Owner");
  const now = 1_750_000_000_000;
  const input = CreateTripSchema.parse({
    name: "Roadtrip",
    destination: "Portugal",
    startDate: "2026-08-01",
    endDate: "2026-08-10",
  });

  const { trip, member } = createTrip(h.db, { userId, input, now });

  expect(trip).toMatchObject({
    name: "Roadtrip",
    destination: "Portugal",
    startDate: "2026-08-01",
    endDate: "2026-08-10",
    currency: "USD",
    version: 0,
    archivedAt: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  expect(member).toMatchObject({
    tripId: trip.id,
    userId,
    role: "owner",
    status: "active",
    joinedAt: now,
  });

  expect(getTrip(h, trip.id)).toBeDefined();
  const members = h.db
    .select()
    .from(schema.tripMembers)
    .where(eq(schema.tripMembers.tripId, trip.id))
    .all();
  expect(members).toHaveLength(1);
  expect(members[0]?.id).toBe(member.id);
});

test("duplicateTrip: copies structure as a template; caller is the sole (new) owner", () => {
  const h = harness();
  const alice = h.insertUser("Alice");
  const bob = h.insertUser("Bob");
  const { tripId, memberId: aliceMemberId } = h.insertTrip(alice, {
    destination: "Kyoto",
    startDate: "2026-10-01",
    endDate: "2026-10-08",
    currency: "JPY",
  });
  // a lived-in source: bumped version + archived must NOT carry over
  h.db
    .update(schema.trips)
    .set({ version: 7, archivedAt: Date.now() })
    .where(eq(schema.trips.id, tripId))
    .run();
  const a1 = h.insertActivity(tripId, aliceMemberId, {
    title: "Fushimi Inari",
    startTime: "07:00",
    endTime: "10:00",
    placeName: "Fushimi Inari Taisha",
    lat: 34.9671,
    lng: 135.7727,
    category: "activity",
    notes: "go early",
    linkUrl: "https://example.com/inari",
  });
  const a2 = h.insertActivity(tripId, aliceMemberId, { title: "Ramen", date: null });

  const { trip: copy } = duplicateTrip(h.db, { userId: bob, sourceTripId: tripId, now: 42 });

  expect(copy).toMatchObject({
    name: "Test Trip (copy)",
    destination: "Kyoto",
    // a template carries no schedule (PD-9)
    startDate: null,
    endDate: null,
    currency: "JPY",
    version: 0,
    archivedAt: null,
    createdBy: bob,
    createdAt: 42,
    updatedAt: 42,
  });
  expect(copy.id).not.toBe(tripId);

  const members = h.db
    .select()
    .from(schema.tripMembers)
    .where(eq(schema.tripMembers.tripId, copy.id))
    .all();
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({ userId: bob, role: "owner", status: "active" });

  const copied = h.db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.tripId, copy.id))
    .all();
  expect(copied).toHaveLength(2);
  const inari = copied.find((a) => a.title === "Fushimi Inari");
  expect(inari).toMatchObject({
    startTime: "07:00",
    endTime: "10:00",
    placeName: "Fushimi Inari Taisha",
    category: "activity",
    notes: "go early",
    linkUrl: "https://example.com/inari",
    createdBy: members[0]?.id,
    createdAt: 42,
  });
  expect(inari?.lat).toBeCloseTo(34.9671);
  for (const a of copied) {
    expect([a1, a2]).not.toContain(a.id);
    expect(a.createdBy).toBe(members[0]?.id);
    // every copied activity lands undated in the Ideas pool (PD-9)
    expect(a.date).toBeNull();
  }
  // the source is untouched
  expect(
    h.db.select().from(schema.activities).where(eq(schema.activities.tripId, tripId)).all(),
  ).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

function routesHarness() {
  const h = harness();
  const current: { user: SessionUser } = {
    user: { id: "", name: "Nobody", email: "nobody@example.com", role: "member" },
  };
  const app = new Hono<AuthedEnv>()
    .use("*", async (c, next) => {
      c.set("user", current.user);
      await next();
    })
    .route("/api/trips", createTripsRoutes({ db: h.db, logger }));
  const actAs = (id: string) => {
    current.user = { id, name: "Test User", email: "test@example.com", role: "member" };
  };
  const post = (route: string, body?: unknown) =>
    app.request(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...h, app, actAs, post };
}

test("POST /api/trips: 201 with the serialized trip and an owner membership", async () => {
  const rh = routesHarness();
  const userId = rh.insertUser("Owner");
  rh.actAs(userId);

  const res = await rh.post("/api/trips", {
    name: "Lisbon",
    startDate: "2026-07-01",
    endDate: "2026-07-10",
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { trip: { id: string; name: string; version: number } };
  expect(body.trip.name).toBe("Lisbon");
  expect(body.trip.version).toBe(0);

  const members = rh.db
    .select()
    .from(schema.tripMembers)
    .where(eq(schema.tripMembers.tripId, body.trip.id))
    .all();
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({ userId, role: "owner", status: "active" });
});

test("POST /api/trips: bad JSON, invalid body, and inverted dates are 400s", async () => {
  const rh = routesHarness();
  rh.actAs(rh.insertUser("Owner"));

  const badJson = await rh.app.request("/api/trips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  expect(badJson.status).toBe(400);
  expect(((await badJson.json()) as { error: { code: string } }).error.code).toBe("invalid_json");

  const noName = await rh.post("/api/trips", { destination: "Anywhere" });
  expect(noName.status).toBe(400);
  expect(((await noName.json()) as { error: { code: string } }).error.code).toBe("invalid_body");

  const badDates = await rh.post("/api/trips", {
    name: "Backwards",
    startDate: "2026-07-10",
    endDate: "2026-07-01",
  });
  expect(badDates.status).toBe(400);
  const badDatesBody = (await badDates.json()) as { error: { code: string; message: string } };
  expect(badDatesBody.error.code).toBe("invalid_body");
  expect(badDatesBody.error.message).toBe("endDate must not be before startDate");
});

test("GET /api/trips: active memberships only, correct memberCount, updatedAt desc, archived included", async () => {
  const rh = routesHarness();
  const alice = rh.insertUser("Alice");
  const bob = rh.insertUser("Bob");
  const carol = rh.insertUser("Carol");

  // oldest: alice owns; bob active editor; carol is a ghost (not counted)
  const { tripId: oldTrip } = rh.insertTrip(alice, { name: "Old", updatedAt: 1000 });
  rh.addMember(oldTrip, bob, "editor");
  rh.addMember(oldTrip, carol, "viewer", "ghost");
  // middle: bob owns; alice active editor
  const { tripId: sharedTrip } = rh.insertTrip(bob, { name: "Shared", updatedAt: 2000 });
  rh.addMember(sharedTrip, alice, "editor");
  // newest: alice owns, archived — still listed
  const { tripId: archivedTrip } = rh.insertTrip(alice, {
    name: "Archived",
    updatedAt: 3000,
    archivedAt: 2500,
  });
  // alice is a ghost here — excluded entirely
  const { tripId: ghostTrip } = rh.insertTrip(bob, { name: "Left", updatedAt: 4000 });
  rh.addMember(ghostTrip, alice, "editor", "ghost");
  // unrelated trip — excluded
  rh.insertTrip(carol, { name: "Other", updatedAt: 5000 });

  rh.actAs(alice);
  const res = await rh.app.request("/api/trips");
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    trips: Array<{
      trip: { id: string; archivedAt: number | null };
      role: string;
      memberCount: number;
    }>;
  };

  expect(TripListItemSchema.array().parse(body.trips)).toBeTruthy();
  expect(body.trips.map((t) => t.trip.id)).toEqual([archivedTrip, sharedTrip, oldTrip]);
  expect(body.trips.map((t) => t.role)).toEqual(["owner", "editor", "owner"]);
  expect(body.trips.map((t) => t.memberCount)).toEqual([1, 2, 2]);
  expect(body.trips[0]?.trip.archivedAt).toBe(2500);
});

test("DELETE /api/trips/:tripId: 404 / not_a_member / owner_only, then cascade delete", async () => {
  const rh = routesHarness();
  const alice = rh.insertUser("Alice");
  const bob = rh.insertUser("Bob");
  const carol = rh.insertUser("Carol");
  const { tripId, memberId } = rh.insertTrip(alice);
  rh.addMember(tripId, bob, "editor");
  rh.insertActivity(tripId, memberId);

  rh.actAs(alice);
  const missing = await rh.app.request(`/api/trips/${createId()}`, { method: "DELETE" });
  expect(missing.status).toBe(404);
  expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("trip_not_found");

  rh.actAs(carol);
  const stranger = await rh.app.request(`/api/trips/${tripId}`, { method: "DELETE" });
  expect(stranger.status).toBe(403);
  expect(((await stranger.json()) as { error: { code: string } }).error.code).toBe("not_a_member");

  rh.actAs(bob);
  const editor = await rh.app.request(`/api/trips/${tripId}`, { method: "DELETE" });
  expect(editor.status).toBe(403);
  expect(((await editor.json()) as { error: { code: string } }).error.code).toBe("owner_only");

  rh.actAs(alice);
  const ok = await rh.app.request(`/api/trips/${tripId}`, { method: "DELETE" });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true });

  expect(getTrip(rh, tripId)).toBeUndefined();
  expect(
    rh.db.select().from(schema.activities).where(eq(schema.activities.tripId, tripId)).all(),
  ).toHaveLength(0);
  expect(
    rh.db.select().from(schema.tripMembers).where(eq(schema.tripMembers.tripId, tripId)).all(),
  ).toHaveLength(0);
});

test("POST /api/trips/:tripId/duplicate: 201 for members with activities copied, 403 otherwise", async () => {
  const rh = routesHarness();
  const alice = rh.insertUser("Alice");
  const bob = rh.insertUser("Bob");
  const carol = rh.insertUser("Carol");
  const { tripId, memberId } = rh.insertTrip(alice);
  rh.addMember(tripId, bob, "editor");
  const sourceActivity = rh.insertActivity(tripId, memberId, { title: "Market tour" });

  rh.actAs(carol);
  const forbidden = await rh.post(`/api/trips/${tripId}/duplicate`);
  expect(forbidden.status).toBe(403);
  expect(((await forbidden.json()) as { error: { code: string } }).error.code).toBe("not_a_member");

  rh.actAs(bob); // any active role may duplicate
  const res = await rh.post(`/api/trips/${tripId}/duplicate`);
  expect(res.status).toBe(201);
  const body = (await res.json()) as { trip: { id: string; name: string } };
  expect(body.trip.name).toBe("Test Trip (copy)");
  expect(body.trip.id).not.toBe(tripId);

  const copied = rh.db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.tripId, body.trip.id))
    .all();
  expect(copied).toHaveLength(1);
  expect(copied[0]?.title).toBe("Market tour");
  expect(copied[0]?.id).not.toBe(sourceActivity);

  const members = rh.db
    .select()
    .from(schema.tripMembers)
    .where(eq(schema.tripMembers.tripId, body.trip.id))
    .all();
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({ userId: bob, role: "owner" });
});

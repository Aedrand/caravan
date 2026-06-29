import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId, type FeedEvent, firstPosition, parseMutation } from "@caravan/shared";
import { afterEach, expect, test, vi } from "vitest";
import { createDb, schema } from "../db";
import { runMigrations } from "../db/migrate";
import "../features"; // registers mutation handlers
import { eventsSince, executeMutation, MutationError } from "./mutations";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-mutations-"));
  tempDirs.push(dir);
  const { db, sqlite } = createDb(path.join(dir, "test.db"));
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

  const insertTrip = (ownerUserId: string) => {
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

  return { db, sqlite, insertUser, insertTrip, addMember };
}

function createActivityMutation(overrides: Record<string, unknown> = {}) {
  return parseMutation({
    id: createId(),
    type: "activity.create",
    payload: {
      activityId: createId(),
      title: "Sunrise hike",
      date: "2026-07-04",
      position: firstPosition(),
      ...overrides,
    },
  });
}

test("create: applies, bumps version to 1, records an attributed feed event", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId, memberId } = h.insertTrip(owner);

  const res = executeMutation(
    { db: h.db },
    { tripId, actor: { userId: owner, type: "user" }, mutation: createActivityMutation() },
  );

  expect(res.version).toBe(1);
  expect(res.event.actorMemberId).toBe(memberId);
  expect(res.event.actorType).toBe("user");
  expect(res.event.entityType).toBe("activity");
  expect(res.event.payload).toEqual({
    title: "Sunrise hike",
    date: "2026-07-04",
    type: "activity",
  });

  const rows = h.db.select().from(schema.activities).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.title).toBe("Sunrise hike");
});

test("idempotency: replaying the same mutation returns the recorded outcome, applies nothing", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };
  const mutation = createActivityMutation();

  const first = executeMutation({ db: h.db }, { tripId, actor, mutation });
  const replay = executeMutation({ db: h.db }, { tripId, actor, mutation });

  expect(replay.version).toBe(first.version);
  expect(replay.event.id).toBe(first.event.id);
  expect(h.db.select().from(schema.activities).all()).toHaveLength(1);
  expect(h.db.select().from(schema.feedEvents).all()).toHaveLength(1);
});

test("versions are strictly monotonic across mutations", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };

  const versions = [1, 2, 3].map(
    (_) =>
      executeMutation({ db: h.db }, { tripId, actor, mutation: createActivityMutation() }).version,
  );
  expect(versions).toEqual([1, 2, 3]);
});

test("authorization: viewers cannot write, editors can, non-members are rejected", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const viewer = h.insertUser("Viewer");
  const editor = h.insertUser("Editor");
  const stranger = h.insertUser("Stranger");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, viewer, "viewer");
  h.addMember(tripId, editor, "editor");

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: { userId: viewer, type: "user" }, mutation: createActivityMutation() },
    ),
  ).toThrowError(expect.objectContaining({ status: 403, code: "insufficient_role" }));

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: { userId: stranger, type: "user" }, mutation: createActivityMutation() },
    ),
  ).toThrowError(expect.objectContaining({ status: 403, code: "not_a_member" }));

  const ok = executeMutation(
    { db: h.db },
    { tripId, actor: { userId: editor, type: "user" }, mutation: createActivityMutation() },
  );
  expect(ok.version).toBe(1);
});

test("ghost members cannot act", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const ghost = h.insertUser("Ghost");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, ghost, "editor", "ghost");

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: { userId: ghost, type: "user" }, mutation: createActivityMutation() },
    ),
  ).toThrowError(expect.objectContaining({ code: "not_a_member" }));
});

test("archived trips are read-only", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  // only one trip exists in this harness — archive it
  h.db.update(schema.trips).set({ archivedAt: Date.now() }).run();

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: { userId: owner, type: "user" }, mutation: createActivityMutation() },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "trip_archived" }));
});

test("move: updates date+position atomically and records from→to in the feed", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };
  const create = createActivityMutation();
  executeMutation({ db: h.db }, { tripId, actor, mutation: create });
  const activityId = (create.payload as { activityId: string }).activityId;

  const res = executeMutation(
    { db: h.db },
    {
      tripId,
      actor,
      mutation: parseMutation({
        id: createId(),
        type: "activity.move",
        payload: { activityId, date: null, position: firstPosition() },
      }),
    },
  );

  expect(res.event.payload).toEqual({
    title: "Sunrise hike",
    fromDate: "2026-07-04",
    toDate: null,
  });
  const row = h.db.select().from(schema.activities).all()[0];
  expect(row?.date).toBeNull();
});

test("update: merges patch, clears/sets place, guards merged time pair", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };
  const create = createActivityMutation({ startTime: "09:00", endTime: "11:00" });
  executeMutation({ db: h.db }, { tripId, actor, mutation: create });
  const activityId = (create.payload as { activityId: string }).activityId;

  executeMutation(
    { db: h.db },
    {
      tripId,
      actor,
      mutation: parseMutation({
        id: createId(),
        type: "activity.update",
        payload: { activityId, patch: { place: { name: "Trailhead", lat: 47.6, lng: -122.3 } } },
      }),
    },
  );
  let row = h.db.select().from(schema.activities).all()[0];
  expect(row?.placeName).toBe("Trailhead");
  expect(row?.lat).toBeCloseTo(47.6);

  // merged-state guard: endTime before existing startTime is rejected
  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor,
        mutation: parseMutation({
          id: createId(),
          type: "activity.update",
          payload: { activityId, patch: { endTime: "08:00" } },
        }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 400, code: "invalid_times" }));

  executeMutation(
    { db: h.db },
    {
      tripId,
      actor,
      mutation: parseMutation({
        id: createId(),
        type: "activity.update",
        payload: { activityId, patch: { place: null } },
      }),
    },
  );
  row = h.db.select().from(schema.activities).all()[0];
  expect(row?.placeName).toBeNull();
});

test("cross-trip safety: activities are invisible to other trips' mutations", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { tripId: otherTrip } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };
  const create = createActivityMutation();
  executeMutation({ db: h.db }, { tripId, actor, mutation: create });
  const activityId = (create.payload as { activityId: string }).activityId;

  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId: otherTrip,
        actor,
        mutation: parseMutation({
          id: createId(),
          type: "activity.delete",
          payload: { activityId },
        }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 404, code: "activity_not_found" }));
});

test("a mutation id cannot be replayed against a different trip", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { tripId: otherTrip } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };
  const mutation = createActivityMutation();
  executeMutation({ db: h.db }, { tripId, actor, mutation });

  expect(() => executeMutation({ db: h.db }, { tripId: otherTrip, actor, mutation })).toThrowError(
    expect.objectContaining({ status: 409, code: "mutation_id_reused" }),
  );
});

test("broadcast fires after success with the recorded event — and not on failure", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const viewer = h.insertUser("Viewer");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, viewer, "viewer");
  const broadcast = vi.fn();

  const res = executeMutation(
    { db: h.db, broadcast },
    { tripId, actor: { userId: owner, type: "user" }, mutation: createActivityMutation() },
  );
  expect(broadcast).toHaveBeenCalledExactlyOnceWith(tripId, res.event, res.entity);
  expect(res.entity).toMatchObject({ id: res.event.entityId, title: "Sunrise hike" });

  expect(() =>
    executeMutation(
      { db: h.db, broadcast },
      { tripId, actor: { userId: viewer, type: "user" }, mutation: createActivityMutation() },
    ),
  ).toThrow(MutationError);
  expect(broadcast).toHaveBeenCalledTimes(1);
});

test("eventsSince returns the ordered tail after a version", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };
  const events: FeedEvent[] = [1, 2, 3, 4].map(
    (_) =>
      executeMutation({ db: h.db }, { tripId, actor, mutation: createActivityMutation() }).event,
  );

  const tail = eventsSince(h.db, tripId, 2);
  expect(tail.map((e) => e.version)).toEqual([3, 4]);
  expect(tail[0]?.id).toBe(events[2]?.id);
  expect(tail[0]?.payload).toEqual({ title: "Sunrise hike", date: "2026-07-04", type: "activity" });
});

test("duplicate entity id from a different mutation is a client-bug 409", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const actor = { userId: owner, type: "user" as const };
  const activityId = createId();
  executeMutation(
    { db: h.db },
    { tripId, actor, mutation: createActivityMutation({ activityId }) },
  );

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor, mutation: createActivityMutation({ activityId }) },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "activity_exists" }));
});

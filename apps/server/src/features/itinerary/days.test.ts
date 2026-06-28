import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId, type Day, parseMutation } from "@caravan/shared";
import { afterEach, expect, test } from "vitest";
import { executeMutation } from "../../core/mutations";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import "../../features"; // registers all mutation handlers

/**
 * First-class days (D2): `day.upsert` lazily finds-or-creates by `(tripId,date)`
 * and patches per-field, so different days never clobber each other.
 */

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-days-"));
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

  const addMember = (tripId: string, userId: string, role: "owner" | "editor" | "viewer") => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.tripMembers)
      .values({ id, tripId, userId, role, status: "active", joinedAt: now, updatedAt: now })
      .run();
    return id;
  };

  const insertTrip = (ownerUserId: string) => {
    const tripId = createId();
    const now = Date.now();
    db.insert(schema.trips)
      .values({
        id: tripId,
        name: "Trip",
        currency: "USD",
        createdBy: ownerUserId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const memberId = addMember(tripId, ownerUserId, "owner");
    return { tripId, memberId };
  };

  const exec = (tripId: string, userId: string, type: string, payload: object) =>
    executeMutation(
      { db },
      {
        tripId,
        actor: { userId, type: "user" },
        mutation: parseMutation({ id: createId(), type, payload }),
      },
    );

  return { db, sqlite, insertUser, insertTrip, addMember, exec };
}

test("day.upsert creates a row lazily on first write, keyed by (tripId,date)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId, memberId } = h.insertTrip(owner);

  expect(h.db.select().from(schema.days).all()).toHaveLength(0);
  const res = h.exec(tripId, owner, "day.upsert", {
    dayId: createId(),
    date: "2026-07-04",
    subtitle: "Arrival",
  });

  const rows = h.db.select().from(schema.days).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.date).toBe("2026-07-04");
  expect(rows[0]?.subtitle).toBe("Arrival");
  expect(rows[0]?.createdBy).toBe(memberId);
  expect(res.event.entityType).toBe("day");
  expect(res.event.payload).toEqual({ date: "2026-07-04", fields: ["subtitle"] });
  expect((res.entity as Day).subtitle).toBe("Arrival");
});

test("day.upsert is find-or-create: a second write to the same date patches the same row", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const firstId = createId();
  h.exec(tripId, owner, "day.upsert", { dayId: firstId, date: "2026-07-04", subtitle: "Arrival" });
  // A different client sends a DIFFERENT dayId for the same date — the unique
  // (tripId,date) index means it updates the existing row, not a duplicate.
  const res = h.exec(tripId, owner, "day.upsert", {
    dayId: createId(),
    date: "2026-07-04",
    subtitle: "Beach day",
  });

  const rows = h.db.select().from(schema.days).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(firstId); // original surrogate id preserved
  expect(rows[0]?.subtitle).toBe("Beach day"); // per-field LWW on the same day
  expect((res.entity as Day).id).toBe(firstId);
});

test("two different dates do not clobber each other", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  h.exec(tripId, owner, "day.upsert", { dayId: createId(), date: "2026-07-04", subtitle: "Day 1" });
  h.exec(tripId, owner, "day.upsert", { dayId: createId(), date: "2026-07-05", subtitle: "Day 2" });

  const rows = h.db.select().from(schema.days).all();
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.subtitle).sort()).toEqual(["Day 1", "Day 2"]);
});

test("clearing the subtitle (null) leaves the row in place", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  h.exec(tripId, owner, "day.upsert", {
    dayId: createId(),
    date: "2026-07-04",
    subtitle: "Arrival",
  });
  h.exec(tripId, owner, "day.upsert", { dayId: createId(), date: "2026-07-04", subtitle: null });

  const rows = h.db.select().from(schema.days).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.subtitle).toBeNull();
});

test("day.upsert requires editor: viewers are rejected", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const viewer = h.insertUser("Viewer");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, viewer, "viewer");

  expect(() =>
    h.exec(tripId, viewer, "day.upsert", { dayId: createId(), date: "2026-07-04", subtitle: "x" }),
  ).toThrowError(expect.objectContaining({ status: 403, code: "insufficient_role" }));
});

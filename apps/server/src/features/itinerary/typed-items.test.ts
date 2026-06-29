import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type Activity,
  createId,
  firstPosition,
  mutationPayloads,
  parseMutation,
} from "@caravan/shared";
import { afterEach, expect, test } from "vitest";
import { executeMutation, MutationError } from "../../core/mutations";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import "../../features"; // registers all mutation handlers

/**
 * Trip Workspace v2 typed items (D1/D7/D10): the `type` discriminator, the
 * estimated-cost planning figure, idea-list membership, and the convergent
 * per-item `checklist.toggle`.
 */

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-typed-items-"));
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

  const createIdeaList = (tripId: string, userId: string, name = "Food") => {
    const listId = createId();
    exec(tripId, userId, "ideaList.create", { listId, name, position: firstPosition() });
    return listId;
  };

  return { db, sqlite, insertUser, insertTrip, addMember, exec, createIdeaList };
}

function createActivity(over: Record<string, unknown> = {}) {
  return {
    activityId: createId(),
    title: "Item",
    date: "2026-07-04",
    position: firstPosition(),
    ...over,
  };
}

test("create note: body lives in the existing notes column, type is note", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const res = h.exec(
    tripId,
    owner,
    "activity.create",
    createActivity({ type: "note", title: "Packing thoughts", notes: "bring a raincoat" }),
  );

  const row = h.db.select().from(schema.activities).all()[0];
  expect(row?.type).toBe("note");
  expect(row?.notes).toBe("bring a raincoat");
  expect(row?.checklistItems).toBeNull();
  expect((res.entity as Activity).type).toBe("note");
});

test("create checklist: items persist and round-trip through the post-image as an array", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const items = [
    { id: createId(), text: "Passport", done: false },
    { id: createId(), text: "Sunscreen", done: true },
  ];
  const res = h.exec(
    tripId,
    owner,
    "activity.create",
    createActivity({ type: "checklist", title: "Pack list", checklistItems: items }),
  );

  // Stored as JSON text...
  const row = h.db.select().from(schema.activities).all()[0];
  expect(JSON.parse(row?.checklistItems ?? "null")).toEqual(items);
  // ...and surfaced as a typed array on the wire.
  expect((res.entity as Activity).checklistItems).toEqual(items);
});

test("estimatedCostMinor: set on create, cleared (null) and re-set on update", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const activityId = createId();
  h.exec(
    tripId,
    owner,
    "activity.create",
    createActivity({ activityId, estimatedCostMinor: 4500 }),
  );
  expect(h.db.select().from(schema.activities).all()[0]?.estimatedCostMinor).toBe(4500);

  h.exec(tripId, owner, "activity.update", { activityId, patch: { estimatedCostMinor: null } });
  expect(h.db.select().from(schema.activities).all()[0]?.estimatedCostMinor).toBeNull();

  h.exec(tripId, owner, "activity.update", { activityId, patch: { estimatedCostMinor: 999 } });
  expect(h.db.select().from(schema.activities).all()[0]?.estimatedCostMinor).toBe(999);
});

test("listId: an idea may join a list on its own trip; a cross-trip list is rejected", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { tripId: otherTrip } = h.insertTrip(owner);

  const listId = h.createIdeaList(tripId, owner);
  const otherListId = h.createIdeaList(otherTrip, owner);

  // Same-trip list attaches.
  const activityId = createId();
  h.exec(tripId, owner, "activity.create", createActivity({ activityId, listId }));
  expect(
    h.db
      .select()
      .from(schema.activities)
      .all()
      .find((a) => a.id === activityId)?.listId,
  ).toBe(listId);

  // A list from another trip is invisible → unknown_list.
  expect(() =>
    h.exec(tripId, owner, "activity.create", createActivity({ listId: otherListId })),
  ).toThrowError(expect.objectContaining({ status: 400, code: "unknown_list" }));

  // ...and the same guard applies on update.
  expect(() =>
    h.exec(tripId, owner, "activity.update", { activityId, patch: { listId: otherListId } }),
  ).toThrowError(expect.objectContaining({ status: 400, code: "unknown_list" }));
});

test("create lodging: endDate + place persist and round-trip through the post-image", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const activityId = createId();
  const res = h.exec(
    tripId,
    owner,
    "activity.create",
    createActivity({
      activityId,
      type: "lodging",
      title: "Hotel Nikko",
      date: "2026-07-04",
      endDate: "2026-07-07",
      confirmationCode: "ABC123",
      place: { name: "Hotel Nikko", lat: 35.6, lng: 139.7 },
    }),
  );

  const row = h.db.select().from(schema.activities).all()[0];
  expect(row?.type).toBe("lodging");
  expect(row?.endDate).toBe("2026-07-07");
  expect(row?.confirmationCode).toBe("ABC123");
  expect(row?.placeName).toBe("Hotel Nikko");
  const entity = res.entity as Activity;
  expect(entity.endDate).toBe("2026-07-07");
  expect(entity.confirmationCode).toBe("ABC123");
  // The feed payload carries `type` so copy can say "added lodging".
  expect((res.event.payload as { type: string }).type).toBe("lodging");
});

test("create flight: endDate + arrival place + flight number persist (place = departure)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const activityId = createId();
  const res = h.exec(
    tripId,
    owner,
    "activity.create",
    createActivity({
      activityId,
      type: "flight",
      title: "SFO -> HND",
      date: "2026-07-03",
      endDate: "2026-07-04",
      flightNumber: "NH7",
      place: { name: "SFO" },
      arrPlace: { name: "Haneda", lat: 35.55, lng: 139.78 },
    }),
  );

  const row = h.db.select().from(schema.activities).all()[0];
  expect(row?.type).toBe("flight");
  expect(row?.endDate).toBe("2026-07-04");
  expect(row?.flightNumber).toBe("NH7");
  expect(row?.placeName).toBe("SFO"); // departure
  expect(row?.arrPlaceName).toBe("Haneda"); // arrival
  expect(row?.arrLat).toBe(35.55);
  const entity = res.entity as Activity;
  expect(entity.arrPlaceName).toBe("Haneda");
  expect(entity.flightNumber).toBe("NH7");
});

test("booking refinements: lodging needs a check-out date; arr/flightNumber are flight-only; endDate >= date", () => {
  // lodging without a check-out date → rejected.
  expect(
    mutationPayloads["activity.create"].safeParse(createActivity({ type: "lodging" })).success,
  ).toBe(false);
  // an arrival place on a non-flight → rejected.
  expect(
    mutationPayloads["activity.create"].safeParse(
      createActivity({ type: "activity", arrPlace: { name: "Haneda" } }),
    ).success,
  ).toBe(false);
  // a flight number on a non-flight → rejected.
  expect(
    mutationPayloads["activity.create"].safeParse(
      createActivity({ type: "activity", flightNumber: "NH7" }),
    ).success,
  ).toBe(false);
  // endDate before date → rejected.
  expect(
    mutationPayloads["activity.create"].safeParse(
      createActivity({ type: "lodging", date: "2026-07-07", endDate: "2026-07-04" }),
    ).success,
  ).toBe(false);
  // valid flight/lodging now parse — the old V2.4 guard is gone.
  expect(
    mutationPayloads["activity.create"].safeParse(
      createActivity({ type: "lodging", endDate: "2026-07-05" }),
    ).success,
  ).toBe(true);
  expect(
    mutationPayloads["activity.create"].safeParse(createActivity({ type: "flight" })).success,
  ).toBe(true);
});

test("booking fields are editable on update (endDate, arrPlace, flightNumber, confirmationCode)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const activityId = createId();
  h.exec(
    tripId,
    owner,
    "activity.create",
    createActivity({ activityId, type: "flight", date: "2026-07-03", endDate: "2026-07-04" }),
  );
  h.exec(tripId, owner, "activity.update", {
    activityId,
    patch: {
      endDate: "2026-07-05",
      flightNumber: "NH7",
      confirmationCode: "ZZ9",
      arrPlace: { name: "Haneda", lat: 35.55, lng: 139.78 },
    },
  });
  const row = h.db.select().from(schema.activities).all()[0];
  expect(row?.endDate).toBe("2026-07-05");
  expect(row?.flightNumber).toBe("NH7");
  expect(row?.confirmationCode).toBe("ZZ9");
  expect(row?.arrPlaceName).toBe("Haneda");
});

test("checklistItems on a non-checklist item is rejected", () => {
  const parsed = mutationPayloads["activity.create"].safeParse(
    createActivity({ type: "note", checklistItems: [{ id: createId(), text: "x", done: false }] }),
  );
  expect(parsed.success).toBe(false);
});

test("type is immutable: it is not an accepted key in the update patch", () => {
  const parsed = mutationPayloads["activity.update"].safeParse({
    activityId: createId(),
    patch: { type: "note" },
  });
  expect(parsed.success).toBe(false);
});

// --- checklist.toggle -------------------------------------------------------

function makeChecklist(h: ReturnType<typeof harness>, tripId: string, userId: string) {
  const activityId = createId();
  const items = [
    { id: createId(), text: "A", done: false },
    { id: createId(), text: "B", done: false },
  ];
  h.exec(
    tripId,
    userId,
    "activity.create",
    createActivity({ activityId, type: "checklist", checklistItems: items }),
  );
  return { activityId, items };
}

test("checklist.toggle flips one item by id and carries the updated array in the post-image", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { activityId, items } = makeChecklist(h, tripId, owner);

  const res = h.exec(tripId, owner, "checklist.toggle", {
    activityId,
    itemId: items[0]?.id,
    done: true,
  });

  expect(res.event.entityType).toBe("activity");
  expect(res.event.payload).toEqual({ title: "Item", item: "A", done: true });
  const toggled = (res.entity as Activity).checklistItems;
  expect(toggled?.find((i) => i.id === items[0]?.id)?.done).toBe(true);
  expect(toggled?.find((i) => i.id === items[1]?.id)?.done).toBe(false);
});

test("checklist.toggle converges: two toggles on different items both stick (no clobber)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { activityId, items } = makeChecklist(h, tripId, owner);

  // Sequential toggles of DIFFERENT items — the second read sees the first write.
  h.exec(tripId, owner, "checklist.toggle", { activityId, itemId: items[0]?.id, done: true });
  h.exec(tripId, owner, "checklist.toggle", { activityId, itemId: items[1]?.id, done: true });

  const row = h.db.select().from(schema.activities).all()[0];
  const stored = JSON.parse(row?.checklistItems ?? "null") as typeof items;
  expect(stored.every((i) => i.done)).toBe(true);
});

test("checklist.toggle: unknown item → 404, non-checklist target → 400", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { activityId } = makeChecklist(h, tripId, owner);

  expect(() =>
    h.exec(tripId, owner, "checklist.toggle", { activityId, itemId: createId(), done: true }),
  ).toThrowError(expect.objectContaining({ status: 404, code: "checklist_item_not_found" }));

  const plain = createId();
  h.exec(tripId, owner, "activity.create", createActivity({ activityId: plain }));
  expect(() =>
    h.exec(tripId, owner, "checklist.toggle", {
      activityId: plain,
      itemId: createId(),
      done: true,
    }),
  ).toThrowError(expect.objectContaining({ status: 400, code: "not_a_checklist" }));
});

test("checklist.toggle: viewers are rejected, editors allowed", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const viewer = h.insertUser("Viewer");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, viewer, "viewer");
  h.addMember(tripId, editor, "editor");
  const { activityId, items } = makeChecklist(h, tripId, owner);

  expect(() =>
    h.exec(tripId, viewer, "checklist.toggle", { activityId, itemId: items[0]?.id, done: true }),
  ).toThrowError(expect.objectContaining({ status: 403, code: "insufficient_role" }));

  const ok = h.exec(tripId, editor, "checklist.toggle", {
    activityId,
    itemId: items[0]?.id,
    done: true,
  });
  expect((ok.entity as Activity).checklistItems?.[0]?.done).toBe(true);
});

test("a checklist create round-trips via JSON without a checklist.toggle (serialize parity)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { items } = makeChecklist(h, tripId, owner);
  // serializeActivity parses the JSON back into the typed array used everywhere.
  const created = h.db.select().from(schema.activities).all()[0];
  expect(JSON.parse(created?.checklistItems ?? "null")).toEqual(items);
});

test("plain create still works with all typed fields defaulted (back-compat)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  h.exec(tripId, owner, "activity.create", createActivity());
  const row = h.db.select().from(schema.activities).all()[0];
  expect(row?.type).toBe("activity");
  expect(row?.estimatedCostMinor).toBeNull();
  expect(row?.listId).toBeNull();
  expect(row?.checklistItems).toBeNull();
});

// Touch the import so the type stays exercised even if assertions change.
test("MutationError is the thrown type for apply-level guards", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  expect(() =>
    h.exec(tripId, owner, "activity.create", createActivity({ listId: createId() })),
  ).toThrow(MutationError);
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createId,
  firstPosition,
  type IdeaList,
  parseMutation,
  positionBetween,
} from "@caravan/shared";
import { afterEach, expect, test } from "vitest";
import { executeMutation } from "../../core/mutations";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import "../../features"; // registers all mutation handlers

/**
 * Idea lists (D10): named buckets for Ideas-pool items. Editor gates
 * create/edit/reorder; creator-or-owner gates delete; deleting a list
 * unassigns its ideas (ON DELETE SET NULL) rather than deleting them.
 */

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-idea-lists-"));
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

const createList = (
  h: ReturnType<typeof harness>,
  tripId: string,
  userId: string,
  name = "Food",
  position = firstPosition(),
) => {
  const listId = createId();
  h.exec(tripId, userId, "ideaList.create", { listId, name, position });
  return listId;
};

test("ideaList.create inserts the list with an attributed feed event", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId, memberId } = h.insertTrip(owner);

  const listId = createId();
  const res = h.exec(tripId, owner, "ideaList.create", {
    listId,
    name: "Food",
    position: firstPosition(),
  });

  expect(res.event.entityType).toBe("ideaList");
  expect(res.event.payload).toEqual({ name: "Food" });
  const row = h.db.select().from(schema.ideaLists).all()[0];
  expect(row?.name).toBe("Food");
  expect(row?.createdBy).toBe(memberId);
  expect((res.entity as IdeaList).name).toBe("Food");
});

test("ideaList.create with a reused id is a 409", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const listId = createList(h, tripId, owner);

  expect(() =>
    h.exec(tripId, owner, "ideaList.create", {
      listId,
      name: "Dupe",
      position: firstPosition(),
    }),
  ).toThrowError(expect.objectContaining({ status: 409, code: "list_exists" }));
});

test("ideaList.update renames; ideaList.reorder moves the ordering key", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const a = createList(h, tripId, owner, "A", firstPosition());
  const b = createList(h, tripId, owner, "B", positionBetween(firstPosition(), null));

  h.exec(tripId, owner, "ideaList.update", { listId: a, name: "Appetizers" });
  expect(
    h.db
      .select()
      .from(schema.ideaLists)
      .all()
      .find((l) => l.id === a)?.name,
  ).toBe("Appetizers");

  // Move A after B.
  const bPos =
    h.db
      .select()
      .from(schema.ideaLists)
      .all()
      .find((l) => l.id === b)?.position ?? null;
  const newPos = positionBetween(bPos, null);
  h.exec(tripId, owner, "ideaList.reorder", { listId: a, position: newPos });
  expect(
    h.db
      .select()
      .from(schema.ideaLists)
      .all()
      .find((l) => l.id === a)?.position,
  ).toBe(newPos);
});

test("ideaList.delete unassigns member ideas (listId → null) without deleting them", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const listId = createList(h, tripId, owner);

  // Two ideas in the list, one Unlisted.
  const inList = createId();
  const unlisted = createId();
  h.exec(tripId, owner, "activity.create", {
    activityId: inList,
    title: "Ramen",
    date: null,
    position: firstPosition(),
    listId,
  });
  h.exec(tripId, owner, "activity.create", {
    activityId: unlisted,
    title: "Museum",
    date: null,
    position: positionBetween(firstPosition(), null),
  });

  const res = h.exec(tripId, owner, "ideaList.delete", { listId });
  expect(res.entity).toBeNull(); // deleted → null post-image

  // The list is gone...
  expect(h.db.select().from(schema.ideaLists).all()).toHaveLength(0);
  // ...but BOTH ideas survive; the member idea's listId is now null.
  const activities = h.db.select().from(schema.activities).all();
  expect(activities).toHaveLength(2);
  expect(activities.find((a) => a.id === inList)?.listId).toBeNull();
  expect(activities.find((a) => a.id === unlisted)?.listId).toBeNull();
});

test("permissions: editors create/edit/reorder; viewers are rejected on every write", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const viewer = h.insertUser("Viewer");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editor, "editor");
  h.addMember(tripId, viewer, "viewer");

  // Editor can create + edit + reorder.
  const listId = createList(h, tripId, editor, "Sights");
  h.exec(tripId, editor, "ideaList.update", { listId, name: "Temples" });
  h.exec(tripId, editor, "ideaList.reorder", {
    listId,
    position: positionBetween(null, firstPosition()),
  });
  expect(h.db.select().from(schema.ideaLists).all()[0]?.name).toBe("Temples");

  // Viewer is rejected everywhere.
  for (const [type, payload] of [
    ["ideaList.create", { listId: createId(), name: "X", position: firstPosition() }],
    ["ideaList.update", { listId, name: "Y" }],
    ["ideaList.reorder", { listId, position: firstPosition() }],
    ["ideaList.delete", { listId }],
  ] as const) {
    expect(() => h.exec(tripId, viewer, type, payload)).toThrowError(
      expect.objectContaining({ status: 403, code: "insufficient_role" }),
    );
  }
});

test("delete permission: a non-creator editor is rejected; the owner can delete any list", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editorA = h.insertUser("EditorA");
  const editorB = h.insertUser("EditorB");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editorA, "editor");
  h.addMember(tripId, editorB, "editor");

  // EditorA creates a list.
  const listId = createList(h, tripId, editorA, "A's list");

  // A different editor cannot delete it.
  expect(() => h.exec(tripId, editorB, "ideaList.delete", { listId })).toThrowError(
    expect.objectContaining({ status: 403, code: "not_yours" }),
  );

  // The owner can delete any list.
  const res = h.exec(tripId, owner, "ideaList.delete", { listId });
  expect(res.entity).toBeNull();
  expect(h.db.select().from(schema.ideaLists).all()).toHaveLength(0);
});

test("cross-trip safety: a list is invisible to another trip's mutations", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { tripId: otherTrip } = h.insertTrip(owner);
  const listId = createList(h, tripId, owner);

  expect(() =>
    h.exec(otherTrip, owner, "ideaList.update", { listId, name: "Hijack" }),
  ).toThrowError(expect.objectContaining({ status: 404, code: "list_not_found" }));
});

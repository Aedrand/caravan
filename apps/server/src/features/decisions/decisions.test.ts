import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId, firstPosition, parseMutation } from "@caravan/shared";
import { eq } from "drizzle-orm";
import { afterEach, expect, test } from "vitest";
import { executeMutation } from "../../core/mutations";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import "../index"; // register all handlers (decisions + itinerary + trips)
import { createDecisionsTables } from "./test-tables";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-decisions-"));
  tempDirs.push(dir);
  const { db, sqlite } = createDb(path.join(dir, "test.db"));
  runMigrations(db);
  createDecisionsTables(sqlite);

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

  const addMember = (tripId: string, userId: string, role: "owner" | "editor" | "viewer") => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.tripMembers)
      .values({ id, tripId, userId, role, status: "active", joinedAt: now, updatedAt: now })
      .run();
    return id;
  };

  const insertActivity = (tripId: string, createdBy: string, title = "Sunrise hike") => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.activities)
      .values({
        id,
        tripId,
        date: "2026-07-04",
        position: firstPosition(),
        title,
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  };

  return { db, insertUser, insertTrip, addMember, insertActivity };
}

const mut = (type: string, payload: Record<string, unknown> = {}) =>
  parseMutation({ id: createId(), type, payload });

const run = (
  h: ReturnType<typeof harness>,
  tripId: string,
  userId: string,
  type: string,
  payload: Record<string, unknown> = {},
) =>
  executeMutation(
    { db: h.db },
    { tripId, actor: { userId, type: "user" }, mutation: mut(type, payload) },
  );

// ---------------------------------------------------------------------------
// Votes (A.1 / PD-2)
// ---------------------------------------------------------------------------

test("vote.toggle: casts then retracts, one row per member per activity", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId, memberId } = h.insertTrip(owner);
  const activityId = h.insertActivity(tripId, owner);

  const cast = run(h, tripId, owner, "vote.toggle", { activityId });
  expect(cast.event.entityType).toBe("vote");
  expect((cast.event.payload as { on: boolean }).on).toBe(true);
  expect(cast.entity).not.toBeNull();
  expect(h.db.select().from(schema.activityVotes).all()).toHaveLength(1);
  expect((cast.entity as { memberId: string }).memberId).toBe(memberId);

  const retract = run(h, tripId, owner, "vote.toggle", { activityId });
  expect((retract.event.payload as { on: boolean }).on).toBe(false);
  expect(retract.entity).toBeNull(); // post-image of a deleted vote
  expect(h.db.select().from(schema.activityVotes).all()).toHaveLength(0);
});

test("vote.toggle: distinct members each get their own vote", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editor, "editor");
  const activityId = h.insertActivity(tripId, owner);

  run(h, tripId, owner, "vote.toggle", { activityId });
  run(h, tripId, editor, "vote.toggle", { activityId });
  expect(h.db.select().from(schema.activityVotes).all()).toHaveLength(2);
});

test("vote.toggle: viewers can't vote", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const viewer = h.insertUser("Viewer");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, viewer, "viewer");
  const activityId = h.insertActivity(tripId, owner);

  expect(() => run(h, tripId, viewer, "vote.toggle", { activityId })).toThrowError(
    expect.objectContaining({ status: 403, code: "insufficient_role" }),
  );
});

// ---------------------------------------------------------------------------
// Comments (A.4 / PD-4)
// ---------------------------------------------------------------------------

test("comment.create/update/delete: author edits, owner can delete others'", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editor, "editor");
  const activityId = h.insertActivity(tripId, owner);

  const commentId = createId();
  const created = run(h, tripId, editor, "comment.create", {
    commentId,
    targetType: "activity",
    targetId: activityId,
    body: "Closed on Mondays",
  });
  expect(created.event.entityType).toBe("comment");
  expect((created.entity as { editedAt: number | null }).editedAt).toBeNull();

  const edited = run(h, tripId, editor, "comment.update", {
    commentId,
    body: "Closed Mondays + Tue",
  });
  expect((edited.entity as { editedAt: number | null }).editedAt).not.toBeNull();

  // A different non-owner editor can't edit someone else's comment.
  const other = h.insertUser("Other");
  h.addMember(tripId, other, "editor");
  expect(() => run(h, tripId, other, "comment.update", { commentId, body: "nope" })).toThrowError(
    expect.objectContaining({ status: 403, code: "not_comment_author" }),
  );
  // ...but the trip owner may delete it.
  const del = run(h, tripId, owner, "comment.delete", { commentId });
  expect(del.entity).toBeNull();
  expect(h.db.select().from(schema.comments).all()).toHaveLength(0);
});

test("comment.create: unknown target is rejected", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  expect(() =>
    run(h, tripId, owner, "comment.create", {
      commentId: createId(),
      targetType: "activity",
      targetId: createId(),
      body: "orphan",
    }),
  ).toThrowError(expect.objectContaining({ status: 404, code: "target_not_found" }));
});

// ---------------------------------------------------------------------------
// Polls (A.2-A.3 / PD-3)
// ---------------------------------------------------------------------------

function createPoll(
  h: ReturnType<typeof harness>,
  tripId: string,
  userId: string,
  opts: Partial<{ multiSelect: boolean; allowMemberOptions: boolean }> = {},
) {
  const pollId = createId();
  const o1 = createId();
  const o2 = createId();
  run(h, tripId, userId, "poll.create", {
    pollId,
    question: "Airbnb or hotel?",
    multiSelect: opts.multiSelect ?? false,
    allowMemberOptions: opts.allowMemberOptions ?? true,
    options: [
      { optionId: o1, label: "Airbnb" },
      { optionId: o2, label: "Hotel" },
    ],
  });
  return { pollId, o1, o2 };
}

test("poll.create: persists poll + options; post-image is the full graph", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { pollId } = createPoll(h, tripId, owner);

  const poll = h.db.select().from(schema.polls).where(eq(schema.polls.id, pollId)).get();
  expect(poll?.question).toBe("Airbnb or hotel?");
  expect(h.db.select().from(schema.pollOptions).all()).toHaveLength(2);
});

test("poll.vote: single-choice replaces the prior vote; multi-select keeps several", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { pollId, o1, o2 } = createPoll(h, tripId, owner);

  run(h, tripId, owner, "poll.vote", { pollId, optionIds: [o1] });
  expect(h.db.select().from(schema.pollVotes).all()).toHaveLength(1);
  // Re-vote a different option: single-choice → still exactly one vote.
  run(h, tripId, owner, "poll.vote", { pollId, optionIds: [o2] });
  const votes = h.db.select().from(schema.pollVotes).all();
  expect(votes).toHaveLength(1);
  expect(votes[0]?.optionId).toBe(o2);

  // Clearing the vote (empty set) removes it.
  run(h, tripId, owner, "poll.vote", { pollId, optionIds: [] });
  expect(h.db.select().from(schema.pollVotes).all()).toHaveLength(0);
});

test("poll.vote: single-choice poll rejects multiple options", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const { pollId, o1, o2 } = createPoll(h, tripId, owner, { multiSelect: false });
  expect(() => run(h, tripId, owner, "poll.vote", { pollId, optionIds: [o1, o2] })).toThrowError(
    expect.objectContaining({ status: 400, code: "single_choice" }),
  );
});

test("poll.addOption: blocked when member options are off (non-creator)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editor, "editor");
  const { pollId } = createPoll(h, tripId, owner, { allowMemberOptions: false });

  expect(() =>
    run(h, tripId, editor, "poll.addOption", { pollId, optionId: createId(), label: "Hostel" }),
  ).toThrowError(expect.objectContaining({ status: 403, code: "options_locked" }));
  // The creator can still add.
  run(h, tripId, owner, "poll.addOption", { pollId, optionId: createId(), label: "Hostel" });
  expect(h.db.select().from(schema.pollOptions).all()).toHaveLength(3);
});

test("poll.close then poll.convert: winning option becomes an Ideas activity", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editor, "editor");
  const { pollId, o1, o2 } = createPoll(h, tripId, owner);

  run(h, tripId, owner, "poll.vote", { pollId, optionIds: [o2] });
  run(h, tripId, editor, "poll.vote", { pollId, optionIds: [o2] });
  run(h, tripId, owner, "poll.vote", { pollId, optionIds: [o2] }); // owner re-affirm (idempotent)

  // Converting before closing is rejected.
  expect(() =>
    run(h, tripId, owner, "poll.convert", { pollId, activityId: createId(), position: "a0" }),
  ).toThrowError(expect.objectContaining({ status: 409, code: "poll_open" }));

  run(h, tripId, owner, "poll.close", { pollId });
  const activityId = createId();
  const conv = run(h, tripId, owner, "poll.convert", { pollId, activityId, position: "a0" });
  expect(conv.event.type).toBe("poll.convert");

  const idea = h.db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.id, activityId))
    .get();
  expect(idea?.date).toBeNull(); // Ideas pool
  expect(idea?.title).toBe("Hotel"); // o2 won
  void o1;

  // Double convert is rejected.
  expect(() =>
    run(h, tripId, owner, "poll.convert", { pollId, activityId: createId(), position: "a1" }),
  ).toThrowError(expect.objectContaining({ status: 409, code: "already_converted" }));
});

test("poll.close: only creator or owner may close", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const creator = h.insertUser("Creator");
  const other = h.insertUser("Other");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, creator, "editor");
  h.addMember(tripId, other, "editor");
  const { pollId } = createPoll(h, tripId, creator);

  expect(() => run(h, tripId, other, "poll.close", { pollId })).toThrowError(
    expect.objectContaining({ status: 403, code: "cannot_close_poll" }),
  );
  // Owner (not creator) can still close.
  run(h, tripId, owner, "poll.close", { pollId });
  expect(
    h.db.select().from(schema.polls).where(eq(schema.polls.id, pollId)).get()?.closedAt,
  ).not.toBeNull();
});

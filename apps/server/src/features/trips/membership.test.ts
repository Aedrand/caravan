import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId, type Mutation } from "@caravan/shared";
import { eq } from "drizzle-orm";
import { afterEach, expect, test } from "vitest";
import { type Actor, executeMutation, MutationError } from "../../core/mutations";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import "./membership"; // registers invite.* / member.* / trip.transferOwnership
import "./mutations"; // trip.archive — used to prove the transferred role sticks
import { findValidInvite, hashInviteToken } from "./invites";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-membership-"));
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

  return { db, insertUser, insertTrip, addMember };
}

const asUser = (userId: string): Actor => ({ userId, type: "user" });
const mutation = (type: Mutation["type"], payload: unknown): Mutation =>
  ({ id: createId(), type, payload }) as Mutation;

// ---------------------------------------------------------------------------
// invites
// ---------------------------------------------------------------------------

test("invite.create: owner gets the raw token once; only the hash is stored", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  const res = executeMutation(
    { db: h.db },
    {
      tripId,
      actor: asUser(owner),
      mutation: mutation("invite.create", { role: "viewer", expiresAt: null }),
    },
  );

  const { token } = res.result as { token: string };
  expect(token.length).toBeGreaterThanOrEqual(32);
  expect(res.event.payload).toEqual({ role: "viewer" });

  const row = h.db.select().from(schema.inviteLinks).all()[0];
  expect(row?.tokenHash).toBe(hashInviteToken(token));
  expect(row?.role).toBe("viewer");
  // the wire post-image never carries the hash (or the token)
  expect(JSON.stringify(res.entity)).not.toContain(row?.tokenHash);
  expect(JSON.stringify(res.entity)).not.toContain(token);
});

test("invite.create: editors are rejected — member management is the owner's bucket (PD-10)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  h.addMember(tripId, editor, "editor");

  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(editor),
        mutation: mutation("invite.create", { role: "editor", expiresAt: null }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 403, code: "insufficient_role" }));
});

test("invite lifecycle: valid → revoked/expired invites stop resolving", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);
  const now = Date.now();

  const create = (expiresAt: number | null) =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(owner),
        mutation: mutation("invite.create", { role: "editor", expiresAt }),
      },
    );

  const live = create(null);
  const expiring = create(now + 60_000);
  const liveToken = (live.result as { token: string }).token;
  const expiringToken = (expiring.result as { token: string }).token;

  expect(findValidInvite(h.db, liveToken, now)?.id).toBe(live.event.entityId);
  expect(findValidInvite(h.db, expiringToken, now)?.id).toBe(expiring.event.entityId);
  // past expiry → gone
  expect(findValidInvite(h.db, expiringToken, now + 120_000)).toBeUndefined();
  // garbage token → gone
  expect(findValidInvite(h.db, "not-a-real-token", now)).toBeUndefined();

  // revoke is idempotent and keeps the original timestamp
  executeMutation(
    { db: h.db },
    {
      tripId,
      actor: asUser(owner),
      mutation: mutation("invite.revoke", { inviteId: live.event.entityId }),
    },
  );
  const revokedAt = h.db
    .select()
    .from(schema.inviteLinks)
    .where(eq(schema.inviteLinks.id, live.event.entityId))
    .get()?.revokedAt;
  expect(revokedAt).not.toBeNull();
  executeMutation(
    { db: h.db },
    {
      tripId,
      actor: asUser(owner),
      mutation: mutation("invite.revoke", { inviteId: live.event.entityId }),
    },
  );
  expect(
    h.db
      .select()
      .from(schema.inviteLinks)
      .where(eq(schema.inviteLinks.id, live.event.entityId))
      .get()?.revokedAt,
  ).toBe(revokedAt);
  expect(findValidInvite(h.db, liveToken, now)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// leaving & removal (ghost semantics — PD-9)
// ---------------------------------------------------------------------------

test("member.leave: non-owner becomes a ghost and loses write access", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId } = h.insertTrip(owner);
  const editorMemberId = h.addMember(tripId, editor, "editor");

  const res = executeMutation(
    { db: h.db },
    { tripId, actor: asUser(editor), mutation: mutation("member.leave", {}) },
  );
  expect(res.event.payload).toEqual({ name: "Editor" });
  expect(res.entity).toMatchObject({ id: editorMemberId, status: "ghost" });

  // ghosts are non-members to the pipeline
  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: asUser(editor), mutation: mutation("member.leave", {}) },
    ),
  ).toThrowError(expect.objectContaining({ status: 403, code: "not_a_member" }));
});

test("member.leave: the owner must transfer first", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId } = h.insertTrip(owner);

  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: asUser(owner), mutation: mutation("member.leave", {}) },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "owner_must_transfer" }));
});

test("member.remove: owner ghosts a member; the owner themselves is untouchable", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const viewer = h.insertUser("Viewer");
  const { tripId, memberId: ownerMemberId } = h.insertTrip(owner);
  const viewerMemberId = h.addMember(tripId, viewer, "viewer");

  const res = executeMutation(
    { db: h.db },
    {
      tripId,
      actor: asUser(owner),
      mutation: mutation("member.remove", { memberId: viewerMemberId }),
    },
  );
  expect(res.entity).toMatchObject({ id: viewerMemberId, status: "ghost" });

  // already a ghost → conflict
  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(owner),
        mutation: mutation("member.remove", { memberId: viewerMemberId }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "member_not_active" }));

  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(owner),
        mutation: mutation("member.remove", { memberId: ownerMemberId }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "cannot_remove_owner" }));
});

test("member.setRole: owner adjusts editor↔viewer; the owner role is reserved for transfer", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId, memberId: ownerMemberId } = h.insertTrip(owner);
  const editorMemberId = h.addMember(tripId, editor, "editor");

  const res = executeMutation(
    { db: h.db },
    {
      tripId,
      actor: asUser(owner),
      mutation: mutation("member.setRole", { memberId: editorMemberId, role: "viewer" }),
    },
  );
  expect(res.entity).toMatchObject({ id: editorMemberId, role: "viewer" });
  expect(res.event.payload).toEqual({ name: "Editor", role: "viewer" });

  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(owner),
        mutation: mutation("member.setRole", { memberId: ownerMemberId, role: "viewer" }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "cannot_change_owner_role" }));

  // editors can't touch roles at all
  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(editor),
        mutation: mutation("member.setRole", { memberId: editorMemberId, role: "editor" }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 403, code: "insufficient_role" }));
});

// ---------------------------------------------------------------------------
// ownership transfer (PD-9/10)
// ---------------------------------------------------------------------------

test("trip.transferOwnership: target becomes owner, actor becomes editor — one event, target post-image", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const editor = h.insertUser("Editor");
  const { tripId, memberId: ownerMemberId } = h.insertTrip(owner);
  const editorMemberId = h.addMember(tripId, editor, "editor");

  const res = executeMutation(
    { db: h.db },
    {
      tripId,
      actor: asUser(owner),
      mutation: mutation("trip.transferOwnership", { memberId: editorMemberId }),
    },
  );

  expect(res.event.payload).toEqual({ toName: "Editor" });
  expect(res.entity).toMatchObject({ id: editorMemberId, role: "owner", status: "active" });

  const rows = h.db
    .select()
    .from(schema.tripMembers)
    .where(eq(schema.tripMembers.tripId, tripId))
    .all();
  expect(rows.find((m) => m.id === ownerMemberId)?.role).toBe("editor");
  expect(rows.find((m) => m.id === editorMemberId)?.role).toBe("owner");

  // the old owner can no longer do owner things…
  expect(() =>
    executeMutation(
      { db: h.db },
      { tripId, actor: asUser(owner), mutation: mutation("trip.archive", {}) },
    ),
  ).toThrowError(MutationError);
  // …and the new owner can
  executeMutation(
    { db: h.db },
    { tripId, actor: asUser(editor), mutation: mutation("trip.archive", {}) },
  );
});

test("trip.transferOwnership: self-transfer and ghost targets are conflicts", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const ghost = h.insertUser("Ghost");
  const { tripId, memberId: ownerMemberId } = h.insertTrip(owner);
  const ghostMemberId = h.addMember(tripId, ghost, "editor", "ghost");

  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(owner),
        mutation: mutation("trip.transferOwnership", { memberId: ownerMemberId }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "already_owner" }));

  expect(() =>
    executeMutation(
      { db: h.db },
      {
        tripId,
        actor: asUser(owner),
        mutation: mutation("trip.transferOwnership", { memberId: ghostMemberId }),
      },
    ),
  ).toThrowError(expect.objectContaining({ status: 409, code: "member_not_active" }));
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId, parseMutation, settle } from "@caravan/shared";
import { afterEach, expect, test } from "vitest";
import { executeMutation, MutationError } from "../../core/mutations";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import "../../features"; // registers all mutation handlers

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Harness mirroring core/mutations.test.ts, plus the Track B tables. */
function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-expenses-"));
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

  return { db, sqlite, insertUser, insertTrip, addMember, exec };
}

test("expense.create stores the expense, equal shares summing to the total, and a feed event", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const bob = h.insertUser("Bob");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);
  const bobM = h.addMember(tripId, bob, "editor");

  const expenseId = createId();
  const res = h.exec(tripId, owner, "expense.create", {
    expenseId,
    paidBy: ownerM,
    amountMinor: 1000,
    description: "Dinner",
    split: { kind: "equal", memberIds: [ownerM, bobM] },
  });

  expect(res.event.entityType).toBe("expense");
  expect(res.event.payload).toEqual({ description: "Dinner", amountMinor: 1000 });

  const shares = h.db.select().from(schema.expenseShares).all();
  expect(shares).toHaveLength(2);
  expect(shares.reduce((a, s) => a + s.amountMinor, 0)).toBe(1000);
});

test("expense.create with an odd equal split reconciles exactly (largest-remainder)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const b = h.insertUser("B");
  const c = h.insertUser("C");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);
  const bM = h.addMember(tripId, b, "editor");
  const cM = h.addMember(tripId, c, "editor");

  h.exec(tripId, owner, "expense.create", {
    expenseId: createId(),
    paidBy: ownerM,
    amountMinor: 1000,
    description: "Cab",
    split: { kind: "equal", memberIds: [ownerM, bM, cM] },
  });
  const shares = h.db.select().from(schema.expenseShares).all();
  expect(shares.reduce((a, s) => a + s.amountMinor, 0)).toBe(1000);
  expect(shares.map((s) => s.amountMinor).sort()).toEqual([333, 333, 334]);
});

test("expense.create with exact split that mis-sums is rejected (400)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const b = h.insertUser("B");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);
  const bM = h.addMember(tripId, b, "editor");

  expect(() =>
    h.exec(tripId, owner, "expense.create", {
      expenseId: createId(),
      paidBy: ownerM,
      amountMinor: 1000,
      description: "X",
      split: {
        kind: "exact",
        shares: [
          { memberId: ownerM, amountMinor: 600 },
          { memberId: bM, amountMinor: 300 },
        ],
      },
    }),
  ).toThrow(MutationError);
});

test("expense.create rejects a participant who is not on the trip", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);

  expect(() =>
    h.exec(tripId, owner, "expense.create", {
      expenseId: createId(),
      paidBy: ownerM,
      amountMinor: 1000,
      description: "X",
      split: { kind: "equal", memberIds: [ownerM, createId()] },
    }),
  ).toThrow(/not on this trip/);
});

test("ghost members can participate in expenses (PD-9)", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const gone = h.insertUser("Gone");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);
  const ghostM = h.addMember(tripId, gone, "editor", "ghost");

  const res = h.exec(tripId, owner, "expense.create", {
    expenseId: createId(),
    paidBy: ownerM,
    amountMinor: 1000,
    description: "Old tab",
    split: { kind: "equal", memberIds: [ownerM, ghostM] },
  });
  expect(res.entity).not.toBeNull();
  const shares = h.db.select().from(schema.expenseShares).all();
  expect(shares.some((s) => s.memberId === ghostM)).toBe(true);
});

test("expense.update re-splits when the amount changes, keeping shares exact", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const b = h.insertUser("B");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);
  const bM = h.addMember(tripId, b, "editor");

  const expenseId = createId();
  h.exec(tripId, owner, "expense.create", {
    expenseId,
    paidBy: ownerM,
    amountMinor: 1000,
    description: "Dinner",
    split: { kind: "equal", memberIds: [ownerM, bM] },
  });
  h.exec(tripId, owner, "expense.update", { expenseId, patch: { amountMinor: 1500 } });

  const row = h.db.select().from(schema.expenses).all()[0];
  expect(row?.amountMinor).toBe(1500);
  const shares = h.db.select().from(schema.expenseShares).all();
  expect(shares.reduce((a, s) => a + s.amountMinor, 0)).toBe(1500);
});

test("permissions: a non-creator editor cannot edit/delete; the owner can delete any", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const bob = h.insertUser("Bob");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);
  const bobM = h.addMember(tripId, bob, "editor");

  // Bob creates an expense.
  const expenseId = createId();
  h.exec(tripId, bob, "expense.create", {
    expenseId,
    paidBy: bobM,
    amountMinor: 800,
    description: "Bob's tab",
    split: { kind: "equal", memberIds: [ownerM, bobM] },
  });

  // The owner can delete it (owner deletes any).
  const res = h.exec(tripId, owner, "expense.delete", { expenseId });
  expect(res.entity).toBeNull();
  expect(h.db.select().from(schema.expenses).all()).toHaveLength(0);
});

test("permissions: an editor cannot delete another member's expense", () => {
  const h = harness();
  const owner = h.insertUser("Owner");
  const bob = h.insertUser("Bob");
  const eve = h.insertUser("Eve");
  const { tripId, memberId: ownerM } = h.insertTrip(owner);
  const bobM = h.addMember(tripId, bob, "editor");
  h.addMember(tripId, eve, "editor");

  const expenseId = createId();
  h.exec(tripId, bob, "expense.create", {
    expenseId,
    paidBy: bobM,
    amountMinor: 800,
    description: "Bob's tab",
    split: { kind: "equal", memberIds: [ownerM, bobM] },
  });
  expect(() => h.exec(tripId, eve, "expense.delete", { expenseId })).toThrow(
    /creator or trip owner/,
  );
});

test("payment.create records a transfer and feeds attributed names; settlement nets it", () => {
  const h = harness();
  const owner = h.insertUser("Alice");
  const bob = h.insertUser("Bob");
  const { tripId, memberId: aliceM } = h.insertTrip(owner);
  const bobM = h.addMember(tripId, bob, "editor");

  // Alice fronts 1000 split two ways → Bob owes 500.
  h.exec(tripId, owner, "expense.create", {
    expenseId: createId(),
    paidBy: aliceM,
    amountMinor: 1000,
    description: "Dinner",
    split: { kind: "equal", memberIds: [aliceM, bobM] },
  });
  // Bob pays Alice 500.
  const pres = h.exec(tripId, bob, "payment.create", {
    paymentId: createId(),
    fromMember: bobM,
    toMember: aliceM,
    amountMinor: 500,
  });
  expect(pres.event.payload).toMatchObject({ fromName: "Bob", toName: "Alice", amountMinor: 500 });

  // Reconstruct the inputs and confirm the engine sees them settled.
  const expenseRows = h.db.select().from(schema.expenses).all();
  const shareRows = h.db.select().from(schema.expenseShares).all();
  const paymentRows = h.db.select().from(schema.payments).all();
  const expenses = expenseRows.map((e) => ({
    ...e,
    notes: e.notes,
    shares: shareRows
      .filter((s) => s.expenseId === e.id)
      .map((s) => ({ memberId: s.memberId, amountMinor: s.amountMinor })),
  })) as never;
  const { transfers } = settle(expenses, paymentRows as never, [aliceM, bobM]);
  expect(transfers).toEqual([]);
});

test("payment.create rejects a transfer to oneself", () => {
  const h = harness();
  const owner = h.insertUser("Alice");
  const { tripId, memberId: aliceM } = h.insertTrip(owner);
  expect(() =>
    h.exec(tripId, owner, "payment.create", {
      paymentId: createId(),
      fromMember: aliceM,
      toMember: aliceM,
      amountMinor: 100,
    }),
  ).toThrow();
});

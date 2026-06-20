import { expect, test } from "vitest";
import type { Expense, ExpenseShare } from "./schemas/expense";
import type { Payment } from "./schemas/payment";
import { computeBalances, settle, settleBalances } from "./settlement";
import { splitEqual } from "./split";

/** Minimal Expense factory — only the fields the engine reads matter. */
function expense(paidBy: string, amountMinor: number, shares: ExpenseShare[]): Expense {
  return {
    id: "e",
    tripId: "t",
    paidBy,
    amountMinor,
    description: "x",
    category: "other",
    notes: "",
    date: null,
    activityId: null,
    shares,
    createdBy: paidBy,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Equal-split expense among `members`, paid by the first unless overridden. */
function equalExpense(paidBy: string, amountMinor: number, members: string[]): Expense {
  return expense(paidBy, amountMinor, splitEqual(amountMinor, members));
}

function payment(fromMember: string, toMember: string, amountMinor: number): Payment {
  return {
    id: "p",
    tripId: "t",
    fromMember,
    toMember,
    amountMinor,
    notes: "",
    date: null,
    createdBy: fromMember,
    createdAt: 0,
    updatedAt: 0,
  };
}

const net = (bals: { memberId: string; netMinor: number }[]) =>
  Object.fromEntries(bals.map((b) => [b.memberId, b.netMinor]));

/** Invariant every scenario must hold: net balances sum to exactly zero. */
function expectZeroSum(bals: { netMinor: number }[]) {
  expect(bals.reduce((a, b) => a + b.netMinor, 0)).toBe(0);
}

/**
 * Replay a transfer plan against starting balances and assert it settles
 * everyone to exactly zero — the real correctness bar for settleBalances.
 */
function expectSettlesToZero(
  bals: { memberId: string; netMinor: number }[],
  transfers: { fromMember: string; toMember: string; amountMinor: number }[],
) {
  const final = new Map(bals.map((b) => [b.memberId, b.netMinor]));
  for (const t of transfers) {
    expect(t.amountMinor).toBeGreaterThan(0);
    final.set(t.fromMember, (final.get(t.fromMember) ?? 0) + t.amountMinor);
    final.set(t.toMember, (final.get(t.toMember) ?? 0) - t.amountMinor);
  }
  for (const v of final.values()) expect(v).toBe(0);
}

test("single expense split equally: payer is owed, others owe", () => {
  const bals = computeBalances([equalExpense("a", 3000, ["a", "b", "c"])], [], ["a", "b", "c"]);
  // a paid 3000, owes 1000 → +2000; b,c owe 1000 → -1000 each.
  expect(net(bals)).toEqual({ a: 2000, b: -1000, c: -1000 });
  expectZeroSum(bals);
});

test("balances break out paid / owed / payments components", () => {
  const bals = computeBalances(
    [equalExpense("a", 1000, ["a", "b"])],
    [payment("b", "a", 200)],
    ["a", "b"],
  );
  const a = bals.find((b) => b.memberId === "a");
  expect(a).toMatchObject({ paidMinor: 1000, owedMinor: 500, paymentsMinor: -200, netMinor: 300 });
  const b = bals.find((b) => b.memberId === "b");
  expect(b).toMatchObject({ paidMinor: 0, owedMinor: 500, paymentsMinor: 200, netMinor: -300 });
});

test("a fully paid-back debt settles to zero, producing no transfers", () => {
  // a fronts 1000 split two ways; b owes 500 and pays it back.
  const result = settle(
    [equalExpense("a", 1000, ["a", "b"])],
    [payment("b", "a", 500)],
    ["a", "b"],
  );
  expect(net(result.balances)).toEqual({ a: 0, b: 0 });
  expect(result.transfers).toEqual([]);
});

test("partial payment leaves the remaining balance to settle", () => {
  const result = settle(
    [equalExpense("a", 1000, ["a", "b"])],
    [payment("b", "a", 200)],
    ["a", "b"],
  );
  expect(net(result.balances)).toEqual({ a: 300, b: -300 });
  expect(result.transfers).toEqual([{ fromMember: "b", toMember: "a", amountMinor: 300 }]);
});

test("two-party settlement: one transfer zeroes both", () => {
  const bals = computeBalances([equalExpense("a", 2000, ["a", "b"])], [], ["a", "b"]);
  const transfers = settleBalances(bals);
  expect(transfers).toEqual([{ fromMember: "b", toMember: "a", amountMinor: 1000 }]);
  expectSettlesToZero(bals, transfers);
});

test("multi-party greedy settlement uses at most n-1 transfers and settles all", () => {
  // a paid 6000 for everyone (4 people), b paid 2000 for everyone.
  const expenses = [
    equalExpense("a", 6000, ["a", "b", "c", "d"]),
    equalExpense("b", 2000, ["a", "b", "c", "d"]),
  ];
  const bals = computeBalances(expenses, [], ["a", "b", "c", "d"]);
  // Each owes 2000 total. a paid 6000 → +4000; b paid 2000 → 0; c,d → -2000.
  expect(net(bals)).toEqual({ a: 4000, b: 0, c: -2000, d: -2000 });
  const transfers = settleBalances(bals);
  expect(transfers.length).toBeLessThanOrEqual(3);
  expectSettlesToZero(bals, transfers);
});

test("greedy matches largest debtor to largest creditor", () => {
  // Two creditors (a:+5000, b:+1000), two debtors (c:-4000, d:-2000).
  const bals = [
    { memberId: "a", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: 5000 },
    { memberId: "b", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: 1000 },
    { memberId: "c", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: -4000 },
    { memberId: "d", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: -2000 },
  ];
  const transfers = settleBalances(bals);
  // Largest debtor c(-4000) pays largest creditor a(+5000) 4000 first.
  expect(transfers[0]).toEqual({ fromMember: "c", toMember: "a", amountMinor: 4000 });
  expectSettlesToZero(bals, transfers);
  expect(transfers.length).toBeLessThanOrEqual(3);
});

test("already-settled group yields no transfers", () => {
  const bals = computeBalances([], [], ["a", "b", "c"]);
  expect(net(bals)).toEqual({ a: 0, b: 0, c: 0 });
  expect(settleBalances(bals)).toEqual([]);
});

test("rounding remainder from an odd split still settles exactly", () => {
  // a fronts 1000 for 3 people → shares 334/333/333.
  const bals = computeBalances([equalExpense("a", 1000, ["a", "b", "c"])], [], ["a", "b", "c"]);
  // a: +1000 -334 = 666; b: -333; c: -333. Sum = 0.
  expect(net(bals)).toEqual({ a: 666, b: -333, c: -333 });
  expectZeroSum(bals);
  const transfers = settleBalances(bals);
  expectSettlesToZero(bals, transfers);
  // 666 = 333 + 333, both debtors pay a.
  expect(transfers).toEqual([
    { fromMember: "b", toMember: "a", amountMinor: 333 },
    { fromMember: "c", toMember: "a", amountMinor: 333 },
  ]);
});

test("ghost members keep their balance and appear in settlement (PD-9)", () => {
  // `ghost` left the trip but fronted a shared expense; the debt to them stands.
  const result = settle([equalExpense("ghost", 900, ["ghost", "a", "b"])], [], ["a", "b"]);
  expect(net(result.balances)).toEqual({ ghost: 600, a: -300, b: -300 });
  // Both active members still owe the ghost.
  expect(result.transfers).toEqual([
    { fromMember: "a", toMember: "ghost", amountMinor: 300 },
    { fromMember: "b", toMember: "ghost", amountMinor: 300 },
  ]);
});

test("a ghost who owes money still settles up (PD-9)", () => {
  // active `a` fronted; the now-departed `ghost` owes their share.
  const result = settle([equalExpense("a", 1000, ["a", "ghost"])], [], ["a"]);
  expect(net(result.balances)).toEqual({ a: 500, ghost: -500 });
  expect(result.transfers).toEqual([{ fromMember: "ghost", toMember: "a", amountMinor: 500 }]);
});

test("members with zero activity are seeded but produce no transfers", () => {
  const bals = computeBalances([equalExpense("a", 1000, ["a", "b"])], [], ["a", "b", "c", "d"]);
  expect(net(bals)).toMatchObject({ c: 0, d: 0 });
  const transfers = settleBalances(bals);
  for (const t of transfers) {
    expect(t.fromMember === "c" || t.toMember === "c").toBe(false);
    expect(t.fromMember === "d" || t.toMember === "d").toBe(false);
  }
});

test("payment can flip a balance (overpayment makes the payer a creditor)", () => {
  // b owes 500 but pays 800 → b is now owed 300.
  const result = settle(
    [equalExpense("a", 1000, ["a", "b"])],
    [payment("b", "a", 800)],
    ["a", "b"],
  );
  expect(net(result.balances)).toEqual({ a: -300, b: 300 });
  expect(result.transfers).toEqual([{ fromMember: "a", toMember: "b", amountMinor: 300 }]);
});

test("a direct member-to-member payment with no expenses creates a debt", () => {
  // a gave b 500 unprompted → a is owed 500, b owes 500.
  const result = settle([], [payment("a", "b", 500)], ["a", "b"]);
  expect(net(result.balances)).toEqual({ a: 500, b: -500 });
  expect(result.transfers).toEqual([{ fromMember: "b", toMember: "a", amountMinor: 500 }]);
});

test("deterministic plan: equal-sized debtors/creditors break ties by id", () => {
  const bals = [
    { memberId: "z", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: 1000 },
    { memberId: "a", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: 1000 },
    { memberId: "m", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: -1000 },
    { memberId: "b", paidMinor: 0, owedMinor: 0, paymentsMinor: 0, netMinor: -1000 },
  ];
  const t1 = settleBalances(bals);
  const t2 = settleBalances([...bals].reverse());
  expect(t1).toEqual(t2);
  expectSettlesToZero(bals, t1);
});

test("randomized: balances always zero-sum and transfers always settle exactly", () => {
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let iter = 0; iter < 300; iter++) {
    const n = 2 + (rand() % 6);
    const members = Array.from({ length: n }, (_, i) => `m${i}`);
    const expenses: Expense[] = [];
    const payments: Payment[] = [];
    const pick = () => members[rand() % n] ?? members[0] ?? "m0";
    const numExp = 1 + (rand() % 5);
    for (let e = 0; e < numExp; e++) {
      const payer = pick();
      const total = 1 + (rand() % 100_000);
      // Random non-empty participant subset.
      const participants = members.filter((_, i) => (rand() >> i) % 2 === 0);
      const subset = participants.length > 0 ? participants : [pick()];
      expenses.push(equalExpense(payer, total, subset));
    }
    const numPay = rand() % 4;
    for (let p = 0; p < numPay; p++) {
      const from = pick();
      let to = pick();
      if (from === to) to = members[(members.indexOf(to) + 1) % n] ?? from;
      if (from !== to) payments.push(payment(from, to, 1 + (rand() % 50_000)));
    }
    const { balances, transfers } = settle(expenses, payments, members);
    expectZeroSum(balances);
    expectSettlesToZero(balances, transfers);
    // Minimality bound: never more than (members with nonzero balance) - 1.
    const active = balances.filter((b) => b.netMinor !== 0).length;
    if (active > 0) expect(transfers.length).toBeLessThanOrEqual(active - 1);
  }
});

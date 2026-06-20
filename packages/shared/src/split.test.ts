import { expect, test } from "vitest";
import { resolveSplit, SplitError, splitEqual } from "./split";

const sum = (shares: { amountMinor: number }[]) => shares.reduce((a, s) => a + s.amountMinor, 0);

test("equal split with no remainder divides cleanly", () => {
  const shares = splitEqual(900, ["a", "b", "c"]);
  expect(shares).toEqual([
    { memberId: "a", amountMinor: 300 },
    { memberId: "b", amountMinor: 300 },
    { memberId: "c", amountMinor: 300 },
  ]);
});

test("equal split distributes the remainder to the FIRST members, stably", () => {
  // 1000 / 3 = 333 r1 → first member gets the extra cent.
  const shares = splitEqual(1000, ["a", "b", "c"]);
  expect(shares).toEqual([
    { memberId: "a", amountMinor: 334 },
    { memberId: "b", amountMinor: 333 },
    { memberId: "c", amountMinor: 333 },
  ]);
  expect(sum(shares)).toBe(1000);
});

test("equal split: remainder spreads across the first `remainder` members", () => {
  // 1000 / 7 = 142 r6 → six members get 143, one gets 142.
  const shares = splitEqual(1000, ["a", "b", "c", "d", "e", "f", "g"]);
  expect(shares.map((s) => s.amountMinor)).toEqual([143, 143, 143, 143, 143, 143, 142]);
  expect(sum(shares)).toBe(1000);
});

test("equal split always reconciles to the cent across many sizes", () => {
  for (let total = 1; total <= 200; total++) {
    for (let n = 1; n <= 9; n++) {
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      const shares = splitEqual(total, ids);
      expect(sum(shares)).toBe(total);
      // No share differs from another by more than one minor unit.
      const amounts = shares.map((s) => s.amountMinor);
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
    }
  }
});

test("equal split of a single member gives them the whole total", () => {
  expect(splitEqual(777, ["solo"])).toEqual([{ memberId: "solo", amountMinor: 777 }]);
});

test("equal split rejects an empty participant list", () => {
  expect(() => splitEqual(100, [])).toThrow(SplitError);
});

test("equal split rejects a duplicated member", () => {
  expect(() => splitEqual(100, ["a", "a"])).toThrow(SplitError);
});

test("resolveSplit(equal) defers to splitEqual", () => {
  const shares = resolveSplit(1000, { kind: "equal", memberIds: ["a", "b", "c"] });
  expect(sum(shares)).toBe(1000);
});

test("resolveSplit(exact) accepts shares that sum to the total", () => {
  const shares = resolveSplit(1000, {
    kind: "exact",
    shares: [
      { memberId: "a", amountMinor: 600 },
      { memberId: "b", amountMinor: 400 },
    ],
  });
  expect(shares).toEqual([
    { memberId: "a", amountMinor: 600 },
    { memberId: "b", amountMinor: 400 },
  ]);
});

test("resolveSplit(exact) drops zero-amount participants", () => {
  const shares = resolveSplit(1000, {
    kind: "exact",
    shares: [
      { memberId: "a", amountMinor: 1000 },
      { memberId: "b", amountMinor: 0 },
    ],
  });
  expect(shares).toEqual([{ memberId: "a", amountMinor: 1000 }]);
});

test("resolveSplit(exact) rejects a sum that misses the total", () => {
  expect(() =>
    resolveSplit(1000, {
      kind: "exact",
      shares: [
        { memberId: "a", amountMinor: 600 },
        { memberId: "b", amountMinor: 300 },
      ],
    }),
  ).toThrow(SplitError);
});

test("resolveSplit rejects a non-positive total", () => {
  expect(() => resolveSplit(0, { kind: "equal", memberIds: ["a"] })).toThrow(SplitError);
});

test("resolveSplit(exact) rejects duplicate members", () => {
  expect(() =>
    resolveSplit(100, {
      kind: "exact",
      shares: [
        { memberId: "a", amountMinor: 50 },
        { memberId: "a", amountMinor: 50 },
      ],
    }),
  ).toThrow(SplitError);
});

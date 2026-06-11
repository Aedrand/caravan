import { expect, test } from "vitest";
import { firstPosition, positionBetween, positionsBetween } from "./position";
import { PositionSchema } from "./schemas/common";

test("keys order lexicographically between their neighbors", () => {
  const a = firstPosition();
  const c = positionBetween(a, null);
  const b = positionBetween(a, c);
  expect(a < b && b < c).toBe(true);
});

test("property: repeated midpoint insertion stays ordered and within bounds", () => {
  let lo = firstPosition();
  let hi = positionBetween(lo, null);
  for (let i = 0; i < 100; i++) {
    const mid = i % 2 === 0 ? positionBetween(lo, hi) : positionBetween(lo, hi);
    expect(lo < mid && mid < hi).toBe(true);
    expect(PositionSchema.safeParse(mid).success).toBe(true);
    if (i % 2 === 0) lo = mid;
    else hi = mid;
  }
});

test("property: append chain of 200 keys is strictly increasing and schema-valid", () => {
  let prev = firstPosition();
  for (let i = 0; i < 200; i++) {
    const next = positionBetween(prev, null);
    expect(next > prev).toBe(true);
    expect(PositionSchema.safeParse(next).success).toBe(true);
    prev = next;
  }
});

test("bulk keys are evenly ordered", () => {
  const keys = positionsBetween(null, null, 25);
  const sorted = [...keys].sort();
  expect(keys).toEqual(sorted);
  expect(new Set(keys).size).toBe(25);
});

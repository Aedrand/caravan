import { expect, test } from "vitest";
import {
  IDEA_PIN_COLOR,
  LIST_PIN_PALETTE,
  listColorExpression,
  listColorForIndex,
  pinFillExpression,
} from "./pin-tint";
import { DAY_ROUTE_FALLBACK_COLOR, DAY_ROUTE_PALETTE, dayColorForIndex } from "./route-features";

// ---------------------------------------------------------------------------
// LIST_PIN_PALETTE (the cool idea-list ramp)
// ---------------------------------------------------------------------------

test("LIST_PIN_PALETTE: 8 distinct literal hex colors", () => {
  expect(LIST_PIN_PALETTE).toHaveLength(8);
  for (const color of LIST_PIN_PALETTE) {
    // Literal hex on purpose — MapLibre paint can't read CSS vars.
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  }
  expect(new Set(LIST_PIN_PALETTE).size).toBe(LIST_PIN_PALETTE.length);
});

test("LIST_PIN_PALETTE: disjoint from the day ramp and both neutrals", () => {
  // The list ramp is a deliberately different (cool, muted) temperature family
  // from the warm day ramp — a shared hex would let an idea pin be mistaken for
  // a day pin. The neutrals stay reserved for their own meanings.
  const days = new Set(DAY_ROUTE_PALETTE);
  for (const color of LIST_PIN_PALETTE) expect(days.has(color)).toBe(false);
  expect(LIST_PIN_PALETTE).not.toContain(IDEA_PIN_COLOR);
  expect(LIST_PIN_PALETTE).not.toContain(DAY_ROUTE_FALLBACK_COLOR);
});

// ---------------------------------------------------------------------------
// listColorForIndex (mirrors dayColorForIndex)
// ---------------------------------------------------------------------------

test("listColorForIndex returns palette colors for valid indices", () => {
  expect(listColorForIndex(0)).toBe(LIST_PIN_PALETTE[0]);
  expect(listColorForIndex(5)).toBe(LIST_PIN_PALETTE[5]);
});

test("listColorForIndex wraps modulo past the palette length", () => {
  const len = LIST_PIN_PALETTE.length;
  expect(listColorForIndex(len)).toBe(LIST_PIN_PALETTE[0]);
  expect(listColorForIndex(len + 3)).toBe(LIST_PIN_PALETTE[3]);
});

test("listColorForIndex falls back to [0] for invalid indices", () => {
  expect(listColorForIndex(-1)).toBe(LIST_PIN_PALETTE[0]);
  expect(listColorForIndex(2.5)).toBe(LIST_PIN_PALETTE[0]);
  expect(listColorForIndex(Number.NaN)).toBe(LIST_PIN_PALETTE[0]);
});

// ---------------------------------------------------------------------------
// listColorExpression (mirrors dayColorExpression, keyed on listId)
// ---------------------------------------------------------------------------

const LIST_IDS = ["1".repeat(32), "2".repeat(32), "3".repeat(32)];

test("listColorExpression builds a well-formed match keyed on listId", () => {
  const expr = listColorExpression(LIST_IDS) as unknown as unknown[];

  expect(expr[0]).toBe("match");
  expect(expr[1]).toEqual(["get", "listId"]);

  // listId → color pairs follow the selector, in position order.
  for (let i = 0; i < LIST_IDS.length; i++) {
    expect(expr[2 + i * 2]).toBe(LIST_IDS[i]);
    expect(expr[3 + i * 2]).toBe(listColorForIndex(i));
  }

  // Trailing fallback defaults to the Unlisted gray.
  expect(expr[expr.length - 1]).toBe(IDEA_PIN_COLOR);
  expect(expr).toHaveLength(2 + LIST_IDS.length * 2 + 1);
});

test("listColorExpression threads a custom fallback into the match arm", () => {
  const expr = listColorExpression(LIST_IDS, "#123456") as unknown as unknown[];
  expect(expr[expr.length - 1]).toBe("#123456");
  expect(expr).not.toContain(IDEA_PIN_COLOR);
});

test("listColorExpression handles empty lists without a malformed match", () => {
  const expr = listColorExpression([]) as unknown as unknown[];
  // NOT a labelless `match` — a constant expression yielding the fallback.
  expect(expr[0]).toBe("to-color");
  expect(expr).toContain(IDEA_PIN_COLOR);
});

// ---------------------------------------------------------------------------
// pinFillExpression (the composed day-then-list fill)
// ---------------------------------------------------------------------------

const DATES = ["2026-05-01", "2026-05-02"];

test("pinFillExpression nests the list match as the day match's fallback", () => {
  const expr = pinFillExpression(DATES, LIST_IDS) as unknown as unknown[];

  // Outer: the day match over the canonical date order.
  expect(expr[0]).toBe("match");
  expect(expr[1]).toEqual(["get", "date"]);
  expect(expr[2]).toBe(DATES[0]);
  expect(expr[3]).toBe(dayColorForIndex(0));

  // Fallback arm: the whole list match (undated pins color by idea list).
  const fallback = expr[expr.length - 1] as unknown[];
  expect(fallback[0]).toBe("match");
  expect(fallback[1]).toEqual(["get", "listId"]);
  expect(fallback[fallback.length - 1]).toBe(IDEA_PIN_COLOR);
});

test("pinFillExpression with no dates degrades to the bare list match", () => {
  const expr = pinFillExpression([], LIST_IDS) as unknown as unknown[];
  expect(expr[0]).toBe("match");
  expect(expr[1]).toEqual(["get", "listId"]);
});

test("pinFillExpression with no lists falls back to the constant Unlisted gray", () => {
  const expr = pinFillExpression(DATES, []) as unknown as unknown[];
  expect(expr[0]).toBe("match");
  expect(expr[1]).toEqual(["get", "date"]);
  expect(expr[expr.length - 1]).toEqual(["to-color", IDEA_PIN_COLOR]);
});

test("pinFillExpression with nothing is a constant gray (never a zero-branch match)", () => {
  const expr = pinFillExpression([], []) as unknown as unknown[];
  expect(expr).toEqual(["to-color", IDEA_PIN_COLOR]);
});

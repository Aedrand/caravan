import type { RouteResult } from "@caravan/shared";
import { expect, test } from "vitest";
import {
  buildRouteFeatureCollection,
  DAY_ROUTE_FALLBACK_COLOR,
  DAY_ROUTE_PALETTE,
  dayColorExpression,
  dayColorForIndex,
} from "./route-features";

/** Minimal RouteResult — only `geometry` matters to the feature builder. */
function route(geometry: [number, number][]): RouteResult {
  return {
    geometry,
    legs: [],
    durationSeconds: 0,
    distanceMeters: 0,
  };
}

const LINE: [number, number][] = [
  [139.7, 35.6],
  [139.8, 35.7],
];

test("dayColorForIndex returns palette colors for valid indices", () => {
  expect(dayColorForIndex(0)).toBe(DAY_ROUTE_PALETTE[0]);
  expect(dayColorForIndex(3)).toBe(DAY_ROUTE_PALETTE[3]);
});

test("dayColorForIndex wraps modulo past the palette length", () => {
  const len = DAY_ROUTE_PALETTE.length;
  expect(dayColorForIndex(len)).toBe(DAY_ROUTE_PALETTE[0]);
  expect(dayColorForIndex(len + 2)).toBe(DAY_ROUTE_PALETTE[2]);
});

test("dayColorForIndex falls back to [0] for invalid indices", () => {
  expect(dayColorForIndex(-1)).toBe(DAY_ROUTE_PALETTE[0]);
  expect(dayColorForIndex(1.5)).toBe(DAY_ROUTE_PALETTE[0]);
  expect(dayColorForIndex(Number.NaN)).toBe(DAY_ROUTE_PALETTE[0]);
});

test("dayColorExpression builds a well-formed match keyed on date", () => {
  const dates = ["2026-05-01", "2026-05-02", "2026-05-03"];
  // Cast back to a readable array — the public type is the opaque
  // ExpressionSpecification bridge, but the runtime shape is a flat match.
  const expr = dayColorExpression(dates) as unknown as unknown[];

  // Head + selector.
  expect(expr[0]).toBe("match");
  expect(expr[1]).toEqual(["get", "date"]);

  // date → color pairs follow the selector, in order.
  for (let i = 0; i < dates.length; i++) {
    expect(expr[2 + i * 2]).toBe(dates[i]);
    expect(expr[3 + i * 2]).toBe(dayColorForIndex(i));
  }

  // Trailing fallback (last element).
  expect(expr[expr.length - 1]).toBe(DAY_ROUTE_FALLBACK_COLOR);
  // Shape: head + selector + 2 per date + fallback.
  expect(expr).toHaveLength(2 + dates.length * 2 + 1);
});

test("dayColorExpression handles empty dates without a malformed match", () => {
  const expr = dayColorExpression([]) as unknown as unknown[];
  // NOT a labelless `match` — a constant color expression yielding the fallback.
  expect(expr[0]).not.toBe("match");
  expect(expr[0]).toBe("to-color");
  expect(expr).toContain(DAY_ROUTE_FALLBACK_COLOR);
});

test("dayColorExpression defaults its fallback to the route grey", () => {
  const expr = dayColorExpression(["2026-05-01"]) as unknown as unknown[];
  expect(expr[expr.length - 1]).toBe(DAY_ROUTE_FALLBACK_COLOR);
});

test("dayColorExpression threads a custom fallback into the match arm", () => {
  // The pin fill passes IDEA_PIN_COLOR here so undated pins (date: null → no
  // branch matched) land on the neutral idea color, not the route grey.
  const expr = dayColorExpression(["2026-05-01", "2026-05-02"], "#123456") as unknown as unknown[];
  expect(expr[0]).toBe("match");
  expect(expr[expr.length - 1]).toBe("#123456");
  expect(expr).not.toContain(DAY_ROUTE_FALLBACK_COLOR);
});

test("dayColorExpression empty-dates guard honors a custom fallback", () => {
  const expr = dayColorExpression([], "#123456") as unknown as unknown[];
  expect(expr[0]).toBe("to-color");
  expect(expr).toContain("#123456");
  expect(expr).not.toContain(DAY_ROUTE_FALLBACK_COLOR);
});

test("dayColorExpression threads a NESTED expression fallback into the match arm", () => {
  // The composed pin fill nests a list-color `match` as the fallback: an
  // undated pin (date: null → no day branch) falls through to the list match.
  const nested = ["match", ["get", "listId"], "list-1", "#abcdef", "#123456"];
  const expr = dayColorExpression(
    ["2026-05-01"],
    nested as unknown as Parameters<typeof dayColorExpression>[1],
  ) as unknown as unknown[];
  expect(expr[0]).toBe("match");
  expect(expr[expr.length - 1]).toBe(nested); // the whole nested match, as-is
});

test("dayColorExpression empty-dates guard returns a nested expression as-is", () => {
  // A zero-branch match must never be produced at any level: with no dates the
  // (already well-formed) nested fallback IS the expression.
  const nested = ["match", ["get", "listId"], "list-1", "#abcdef", "#123456"];
  const expr = dayColorExpression(
    [],
    nested as unknown as Parameters<typeof dayColorExpression>[1],
  );
  expect(expr).toBe(nested);
});

test("buildRouteFeatureCollection emits one LineString per visible day", () => {
  const routes = new Map<string, RouteResult>([
    ["2026-05-01", route(LINE)],
    ["2026-05-02", route(LINE)],
  ]);
  const fc = buildRouteFeatureCollection(routes, new Set());

  expect(fc.type).toBe("FeatureCollection");
  expect(fc.features).toHaveLength(2);
  for (const f of fc.features) {
    expect(f.geometry.type).toBe("LineString");
  }
});

test("buildRouteFeatureCollection threads date + geometry into each feature", () => {
  const routes = new Map<string, RouteResult>([["2026-05-01", route(LINE)]]);
  const [feature] = buildRouteFeatureCollection(routes, new Set()).features;

  expect(feature?.properties).toEqual({ date: "2026-05-01" });
  expect(feature?.geometry).toEqual({ type: "LineString", coordinates: LINE });
});

test("buildRouteFeatureCollection drops hidden days", () => {
  const routes = new Map<string, RouteResult>([
    ["2026-05-01", route(LINE)],
    ["2026-05-02", route(LINE)],
  ]);
  const fc = buildRouteFeatureCollection(routes, new Set(["2026-05-01"]));

  expect(fc.features).toHaveLength(1);
  expect(fc.features[0]?.properties).toEqual({ date: "2026-05-02" });
});

test("buildRouteFeatureCollection drops routes with fewer than 2 points", () => {
  const routes = new Map<string, RouteResult>([
    ["2026-05-01", route([])],
    ["2026-05-02", route([[139.7, 35.6]])],
    ["2026-05-03", route(LINE)],
  ]);
  const fc = buildRouteFeatureCollection(routes, new Set());

  expect(fc.features).toHaveLength(1);
  expect(fc.features[0]?.properties).toEqual({ date: "2026-05-03" });
});

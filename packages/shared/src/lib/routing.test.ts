import { expect, test } from "vitest";
import { effectiveRouteMode } from "./routing";

test("effectiveRouteMode: day override wins over the trip default", () => {
  expect(effectiveRouteMode("walking", "driving")).toBe("driving");
  expect(effectiveRouteMode("driving", "walking")).toBe("walking");
});

test("effectiveRouteMode: null override falls back to the trip default", () => {
  expect(effectiveRouteMode("walking", null)).toBe("walking");
  expect(effectiveRouteMode("driving", null)).toBe("driving");
});

test("effectiveRouteMode: a matching override is idempotent", () => {
  expect(effectiveRouteMode("walking", "walking")).toBe("walking");
});

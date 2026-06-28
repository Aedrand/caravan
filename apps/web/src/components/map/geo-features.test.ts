import type { Activity } from "@caravan/shared";
import { expect, test } from "vitest";
import {
  isPlotted,
  type Plotted,
  stopNumbersByDay,
  toFeatureCollection,
  unplottedWithPlace,
} from "./geo-features";

const fid = (c: string) => c.repeat(32);

function activity(over: Partial<Activity>): Activity {
  return {
    id: "a".repeat(32),
    tripId: "b".repeat(32),
    date: null,
    position: "a0",
    title: "Somewhere",
    startTime: null,
    endTime: null,
    placeName: null,
    address: null,
    lat: null,
    lng: null,
    placeProvider: null,
    placeRef: null,
    category: "other",
    notes: "",
    linkUrl: null,
    type: "activity",
    estimatedCostMinor: null,
    listId: null,
    checklistItems: null,
    createdBy: "c".repeat(32),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

test("isPlotted: needs both coordinates", () => {
  expect(isPlotted(activity({ lat: 1, lng: 2 }))).toBe(true);
  expect(isPlotted(activity({ lat: 1, lng: null }))).toBe(false);
  expect(isPlotted(activity({ lat: null, lng: 2 }))).toBe(false);
  expect(isPlotted(activity({}))).toBe(false);
});

test("isPlotted: lat/lng of 0 still counts (Gulf of Guinea is a real place)", () => {
  expect(isPlotted(activity({ lat: 0, lng: 0 }))).toBe(true);
});

test("unplottedWithPlace: named-but-uncoordinated only", () => {
  const named = activity({ placeName: "Hidden café" });
  const coordinated = activity({ id: "d".repeat(32), placeName: "Pinned", lat: 1, lng: 2 });
  const bare = activity({ id: "e".repeat(32) }); // no name → not shown as unplotted
  const out = unplottedWithPlace([named, coordinated, bare]);
  expect(out).toEqual([named]);
});

test("toFeatureCollection: one Point feature per plotted activity, id+title in props", () => {
  const fc = toFeatureCollection([{ ...activity({ title: "Belém" }), lat: 38.7, lng: -9.2 }]);
  expect(fc.type).toBe("FeatureCollection");
  expect(fc.features).toHaveLength(1);
  const f = fc.features[0];
  expect(f?.geometry).toEqual({ type: "Point", coordinates: [-9.2, 38.7] }); // GeoJSON is [lng, lat]
  expect(f?.properties).toMatchObject({ title: "Belém" });
});

test("toFeatureCollection: no `number` property when no lookup is supplied", () => {
  const fc = toFeatureCollection([{ ...activity({ title: "X" }), lat: 1, lng: 2 }]);
  expect(fc.features[0]?.properties).not.toHaveProperty("number");
});

test("stopNumbersByDay: numbers each day independently (resets per day) and merges by id", () => {
  const items = [
    activity({ id: fid("1"), date: "2026-07-04", position: "a0" }),
    activity({ id: fid("2"), date: "2026-07-04", position: "a1" }),
    activity({ id: fid("3"), date: "2026-07-05", position: "a0" }),
  ];
  const n = stopNumbersByDay(items);
  expect(n.get(fid("1"))).toBe(1);
  expect(n.get(fid("2"))).toBe(2);
  expect(n.get(fid("3"))).toBe(1); // new day → resets to 1
});

test("stopNumbersByDay: undated (Ideas-pool) items never get a stop number", () => {
  const n = stopNumbersByDay([
    activity({ id: fid("1"), date: "2026-07-04", position: "a0" }),
    activity({ id: fid("2"), date: null, position: "a1" }),
  ]);
  expect(n.get(fid("1"))).toBe(1);
  expect(n.has(fid("2"))).toBe(false);
});

test("toFeatureCollection: pins keep their rail number — a subset, never a renumber", () => {
  // An UNPLOTTED stop sits between two plotted ones in the day's order. It still
  // consumes its rail number (#2), so the plotted pins must read 1 and 3 — proving
  // the map shows a faithful subset of the rail numbers, not a 1,2 renumbering.
  const a: Plotted = {
    ...activity({ id: fid("a"), date: "2026-07-04", position: "a0" }),
    lat: 1,
    lng: 2,
  };
  const b = activity({ id: fid("b"), date: "2026-07-04", position: "a1" }); // unplotted (no coords)
  const c: Plotted = {
    ...activity({ id: fid("c"), date: "2026-07-04", position: "a2" }),
    lat: 3,
    lng: 4,
  };

  const numbers = stopNumbersByDay([a, b, c]);
  const fc = toFeatureCollection([a, c], numbers);
  expect(fc.features[0]?.properties?.number).toBe(1);
  expect(fc.features[1]?.properties?.number).toBe(3);
});

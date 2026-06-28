import type { Activity } from "@caravan/shared";
import { expect, test } from "vitest";
import { isPlotted, toFeatureCollection, unplottedWithPlace } from "./geo-features";

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

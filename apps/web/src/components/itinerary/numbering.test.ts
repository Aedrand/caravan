import type { Activity } from "@caravan/shared";
import { describe, expect, it } from "vitest";
import { computeStopNumbers } from "./numbering";

const id = (n: number) => n.toString(16).padStart(32, "0");

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: id(1),
    tripId: id(99),
    date: "2026-07-04",
    position: "a0",
    title: "Stop",
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
    endDate: null,
    confirmationCode: null,
    arrPlaceName: null,
    arrAddress: null,
    arrLat: null,
    arrLng: null,
    arrPlaceProvider: null,
    arrPlaceRef: null,
    flightNumber: null,
    createdBy: id(98),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("computeStopNumbers", () => {
  it("numbers activity-type stops 1..N in position order", () => {
    const items = [
      activity({ id: id(1), position: "a1" }),
      activity({ id: id(2), position: "a0" }),
      activity({ id: id(3), position: "a2" }),
    ];
    const numbers = computeStopNumbers(items);
    expect(numbers.get(id(2))).toBe(1);
    expect(numbers.get(id(1))).toBe(2);
    expect(numbers.get(id(3))).toBe(3);
  });

  it("is order-independent: input order does not affect the numbers", () => {
    const a = activity({ id: id(1), position: "a0" });
    const b = activity({ id: id(2), position: "a1" });
    expect(computeStopNumbers([a, b])).toEqual(computeStopNumbers([b, a]));
  });

  it("skips note and checklist rows (not numbered, do not consume a number)", () => {
    const items = [
      activity({ id: id(1), position: "a0", type: "activity" }),
      activity({ id: id(2), position: "a1", type: "note" }),
      activity({ id: id(3), position: "a2", type: "checklist" }),
      activity({ id: id(4), position: "a3", type: "activity" }),
    ];
    const numbers = computeStopNumbers(items);
    expect(numbers.get(id(1))).toBe(1);
    expect(numbers.has(id(2))).toBe(false);
    expect(numbers.has(id(3))).toBe(false);
    expect(numbers.get(id(4))).toBe(2);
    expect(numbers.size).toBe(2);
  });

  it("skips flight and lodging bookings (not numbered, do not consume a number)", () => {
    const items = [
      activity({ id: id(1), position: "a0", type: "activity" }),
      activity({ id: id(2), position: "a1", type: "flight" }),
      activity({ id: id(3), position: "a2", type: "lodging" }),
      activity({ id: id(4), position: "a3", type: "activity" }),
    ];
    const numbers = computeStopNumbers(items);
    expect(numbers.get(id(1))).toBe(1);
    expect(numbers.has(id(2))).toBe(false);
    expect(numbers.has(id(3))).toBe(false);
    expect(numbers.get(id(4))).toBe(2);
    expect(numbers.size).toBe(2);
  });

  it("numbers both plotted and unplotted stops with the same scheme", () => {
    const plotted = activity({ id: id(1), position: "a0", lat: 35.0, lng: 135.7 });
    const unplotted = activity({ id: id(2), position: "a1", lat: null, lng: null });
    const numbers = computeStopNumbers([plotted, unplotted]);
    expect(numbers.get(id(1))).toBe(1);
    expect(numbers.get(id(2))).toBe(2);
  });

  it("ignores undated items (the Ideas pool) so they never get a stop number", () => {
    const items = [
      activity({ id: id(1), position: "a0", date: "2026-07-04" }),
      activity({ id: id(2), position: "a1", date: null }),
    ];
    const numbers = computeStopNumbers(items);
    expect(numbers.get(id(1))).toBe(1);
    expect(numbers.has(id(2))).toBe(false);
  });

  it("returns an empty map for no stops", () => {
    expect(computeStopNumbers([]).size).toBe(0);
    expect(computeStopNumbers([activity({ type: "note" })]).size).toBe(0);
  });
});

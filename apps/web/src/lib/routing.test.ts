import type { Activity, AnchorRef } from "@caravan/shared";
import { describe, expect, it } from "vitest";
import { buildDayWaypoints, formatDistance, formatDuration, hashWaypoints } from "./routing";

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

function anchor(over: Partial<AnchorRef> = {}): AnchorRef {
  return { bookingId: null, placeName: null, lat: null, lng: null, ...over };
}

const NO_ANCHORS = { start: null, end: null };

describe("buildDayWaypoints", () => {
  it("orders plotted activity stops by position", () => {
    const items = [
      activity({ id: id(1), position: "a2", lat: 35.2, lng: 135.2 }),
      activity({ id: id(2), position: "a0", lat: 35.0, lng: 135.0 }),
      activity({ id: id(3), position: "a1", lat: 35.1, lng: 135.1 }),
    ];
    expect(buildDayWaypoints(items, NO_ANCHORS)).toEqual([
      { lat: 35.0, lng: 135.0 },
      { lat: 35.1, lng: 135.1 },
      { lat: 35.2, lng: 135.2 },
    ]);
  });

  it("prepends the start anchor and appends the end anchor when both are plotted", () => {
    const items = [activity({ id: id(1), position: "a0", lat: 35.1, lng: 135.1 })];
    const anchors = {
      start: anchor({ lat: 35.0, lng: 135.0 }),
      end: anchor({ lat: 35.2, lng: 135.2 }),
    };
    expect(buildDayWaypoints(items, anchors)).toEqual([
      { lat: 35.0, lng: 135.0 },
      { lat: 35.1, lng: 135.1 },
      { lat: 35.2, lng: 135.2 },
    ]);
  });

  it("omits an anchor that is missing lat or lng", () => {
    const items = [
      activity({ id: id(1), position: "a0", lat: 35.1, lng: 135.1 }),
      activity({ id: id(2), position: "a1", lat: 35.2, lng: 135.2 }),
    ];
    const anchors = {
      start: anchor({ lat: 35.0, lng: null }),
      end: anchor({ lat: null, lng: 135.3 }),
    };
    expect(buildDayWaypoints(items, anchors)).toEqual([
      { lat: 35.1, lng: 135.1 },
      { lat: 35.2, lng: 135.2 },
    ]);
  });

  it("excludes unplotted activity stops (null lat/lng)", () => {
    const items = [
      activity({ id: id(1), position: "a0", lat: 35.0, lng: 135.0 }),
      activity({ id: id(2), position: "a1", lat: null, lng: null }),
      activity({ id: id(3), position: "a2", lat: 35.2, lng: 135.2 }),
    ];
    expect(buildDayWaypoints(items, NO_ANCHORS)).toEqual([
      { lat: 35.0, lng: 135.0 },
      { lat: 35.2, lng: 135.2 },
    ]);
  });

  it("excludes notes, checklists, flights and lodgings even when plotted", () => {
    const items = [
      activity({ id: id(1), position: "a0", type: "activity", lat: 35.0, lng: 135.0 }),
      activity({ id: id(2), position: "a1", type: "note", lat: 35.1, lng: 135.1 }),
      activity({ id: id(3), position: "a2", type: "checklist", lat: 35.2, lng: 135.2 }),
      activity({ id: id(4), position: "a3", type: "flight", lat: 35.3, lng: 135.3 }),
      activity({ id: id(5), position: "a4", type: "lodging", lat: 35.4, lng: 135.4 }),
      activity({ id: id(6), position: "a5", type: "activity", lat: 35.5, lng: 135.5 }),
    ];
    expect(buildDayWaypoints(items, NO_ANCHORS)).toEqual([
      { lat: 35.0, lng: 135.0 },
      { lat: 35.5, lng: 135.5 },
    ]);
  });

  it("returns [] when fewer than two coordinates result", () => {
    const single = [activity({ id: id(1), position: "a0", lat: 35.0, lng: 135.0 })];
    expect(buildDayWaypoints(single, NO_ANCHORS)).toEqual([]);
    expect(buildDayWaypoints([], NO_ANCHORS)).toEqual([]);
    // A lone stop + one anchor still reaches two and is NOT empty.
    expect(
      buildDayWaypoints(single, { start: anchor({ lat: 34.9, lng: 134.9 }), end: null }),
    ).toEqual([
      { lat: 34.9, lng: 134.9 },
      { lat: 35.0, lng: 135.0 },
    ]);
  });
});

describe("hashWaypoints", () => {
  it("joins lat,lng pairs at 5 decimal places with |", () => {
    expect(
      hashWaypoints([
        { lat: 35.123456, lng: 135.987654 },
        { lat: 36, lng: 137 },
      ]),
    ).toBe("35.12346,135.98765|36.00000,137.00000");
  });

  it("is stable: equal inputs hash equally and rounding is deterministic", () => {
    const a = [{ lat: 35.1234561, lng: 135.0 }];
    const b = [{ lat: 35.1234569, lng: 135.0 }];
    expect(hashWaypoints(a)).toBe(hashWaypoints(b));
    expect(hashWaypoints([])).toBe("");
  });
});

describe("formatDuration", () => {
  it("shows < 1 min for sub-30-second durations", () => {
    expect(formatDuration(0)).toBe("< 1 min");
    expect(formatDuration(29)).toBe("< 1 min");
  });

  it("rounds to the nearest minute", () => {
    expect(formatDuration(30)).toBe("1 min");
    expect(formatDuration(1320)).toBe("22 min");
  });

  it("splits into hours and minutes past an hour", () => {
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3900)).toBe("1 h 5 min");
    expect(formatDuration(7380)).toBe("2 h 3 min");
  });
});

describe("formatDistance", () => {
  it("shows whole metres below 1 km", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(820)).toBe("820 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("shows km with one decimal at/above 1 km", () => {
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(1400)).toBe("1.4 km");
    expect(formatDistance(12345)).toBe("12.3 km");
  });
});

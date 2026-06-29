import { expect, test } from "vitest";
import type { Activity } from "../schemas/activity";
import {
  computeBookingDerivedEntries,
  type DayOverride,
  deriveAnchors,
  shiftIsoDate,
} from "./bookings";

function makeActivity(over: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    tripId: "t1",
    date: "2026-07-04",
    position: "a0",
    title: "Item",
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
    createdBy: "m1",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const lodging = (over: Partial<Activity>): Activity =>
  makeActivity({ type: "lodging", placeName: "Hotel", ...over });
const flight = (over: Partial<Activity>): Activity => makeActivity({ type: "flight", ...over });

function override(over: Partial<DayOverride> & { homeBasePlaceName: string | null }): DayOverride {
  return {
    homeBasePlaceName: over.homeBasePlaceName,
    homeBaseAddress: over.homeBaseAddress ?? null,
    homeBaseLat: over.homeBaseLat ?? null,
    homeBaseLng: over.homeBaseLng ?? null,
    homeBasePlaceProvider: over.homeBasePlaceProvider ?? null,
    homeBasePlaceRef: over.homeBasePlaceRef ?? null,
  };
}

const NO_OVERRIDES = new Map<string, DayOverride>();

// --- shiftIsoDate ----------------------------------------------------------

test("shiftIsoDate steps across month and year boundaries with no tz math", () => {
  expect(shiftIsoDate("2026-07-04", -1)).toBe("2026-07-03");
  expect(shiftIsoDate("2026-07-01", -1)).toBe("2026-06-30");
  expect(shiftIsoDate("2026-12-31", 1)).toBe("2027-01-01");
  expect(shiftIsoDate("2026-03-01", -1)).toBe("2026-02-28");
});

// --- computeBookingDerivedEntries ------------------------------------------

test("same-day flight spawns no derived entry", () => {
  const f = flight({
    date: "2026-07-04",
    endDate: "2026-07-04",
    arrPlaceName: "Haneda",
    arrLat: 35.55,
    arrLng: 139.78,
  });
  expect(computeBookingDerivedEntries(f)).toEqual([]);
});

test("overnight flight spawns one arrival entry on endDate at the arrival place", () => {
  const f = flight({
    id: "fl",
    date: "2026-07-04",
    endDate: "2026-07-05",
    endTime: "06:30",
    arrPlaceName: "Haneda",
    arrLat: 35.55,
    arrLng: 139.78,
  });
  expect(computeBookingDerivedEntries(f)).toEqual([
    {
      kind: "flight-arrive",
      date: "2026-07-05",
      time: "06:30",
      placeName: "Haneda",
      lat: 35.55,
      lng: 139.78,
      title: "Arrive Haneda",
      sourceBookingId: "fl",
    },
  ]);
});

test("a 3-night lodging spawns one check-out entry on endDate at the lodging place", () => {
  const l = lodging({
    id: "lo",
    date: "2026-07-04",
    endDate: "2026-07-07",
    placeName: "Hotel Nikko",
    lat: 35.6,
    lng: 139.7,
  });
  expect(computeBookingDerivedEntries(l)).toEqual([
    {
      kind: "check-out",
      date: "2026-07-07",
      time: null,
      placeName: "Hotel Nikko",
      lat: 35.6,
      lng: 139.7,
      title: "Check out of Hotel Nikko",
      sourceBookingId: "lo",
    },
  ]);
});

test("non-booking items spawn nothing", () => {
  expect(computeBookingDerivedEntries(makeActivity({ type: "activity" }))).toEqual([]);
  expect(computeBookingDerivedEntries(makeActivity({ type: "note" }))).toEqual([]);
});

test("a flight with no arrival date spawns nothing", () => {
  expect(computeBookingDerivedEntries(flight({ date: "2026-07-04", endDate: null }))).toEqual([]);
});

// --- deriveAnchors ---------------------------------------------------------

test("no bookings → both anchors null", () => {
  const { start, end } = deriveAnchors([], "2026-07-04", NO_OVERRIDES);
  expect(start).toBeNull();
  expect(end).toBeNull();
});

test("a single multi-night hotel anchors each day correctly", () => {
  const hotel = lodging({
    id: "h",
    date: "2026-07-04",
    endDate: "2026-07-07",
    placeName: "Hotel",
    lat: 1,
    lng: 2,
  });
  const bookings = [hotel];
  const ref = { bookingId: "h", placeName: "Hotel", lat: 1, lng: 2 };

  // First day (check-in): arrived from elsewhere → END only.
  const first = deriveAnchors(bookings, "2026-07-04", NO_OVERRIDES);
  expect(first.start).toBeNull();
  expect(first.end).toEqual(ref);

  // Interior day: woke and slept at the hotel → START + END.
  const interior = deriveAnchors(bookings, "2026-07-05", NO_OVERRIDES);
  expect(interior.start).toEqual(ref);
  expect(interior.end).toEqual(ref);

  // Last day (check-out): woke at the hotel, then left → START only.
  const last = deriveAnchors(bookings, "2026-07-07", NO_OVERRIDES);
  expect(last.start).toEqual(ref);
  expect(last.end).toBeNull();
});

test("transfer day (Hotel A out + Hotel B in same day): START=A, END=B", () => {
  // NOTE: the V2.4 blueprint prose said this day has "neither lodging anchor",
  // but that is provably inconsistent with the multi-night rule above — the
  // transfer day is simultaneously A's check-out (→ START=A) and B's check-in
  // (→ END=B). The correct, map-useful result is START=Hotel A, END=Hotel B.
  const a = lodging({
    id: "A",
    date: "2026-07-01",
    endDate: "2026-07-03",
    placeName: "Hotel A",
    lat: 1,
    lng: 1,
  });
  const b = lodging({
    id: "B",
    date: "2026-07-03",
    endDate: "2026-07-05",
    placeName: "Hotel B",
    lat: 2,
    lng: 2,
  });
  const { start, end } = deriveAnchors([a, b], "2026-07-03", NO_OVERRIDES);
  expect(start).toEqual({ bookingId: "A", placeName: "Hotel A", lat: 1, lng: 1 });
  expect(end).toEqual({ bookingId: "B", placeName: "Hotel B", lat: 2, lng: 2 });
});

test("a home-base override sets END(N) and START(N+1) to the override place", () => {
  const overrides = new Map<string, DayOverride>([
    [
      "2026-07-04",
      override({ homeBasePlaceName: "Friend's place", homeBaseLat: 9, homeBaseLng: 9 }),
    ],
  ]);
  const expected = { bookingId: null, placeName: "Friend's place", lat: 9, lng: 9 };
  expect(deriveAnchors([], "2026-07-04", overrides).end).toEqual(expected);
  expect(deriveAnchors([], "2026-07-05", overrides).start).toEqual(expected);
});

test("an override on day N wins START(N+1) even over a flight arriving that morning", () => {
  const overrides = new Map<string, DayOverride>([
    [
      "2026-07-04",
      override({ homeBasePlaceName: "Friend's place", homeBaseLat: 9, homeBaseLng: 9 }),
    ],
  ]);
  const f = flight({
    id: "fl",
    date: "2026-07-04",
    endDate: "2026-07-05",
    arrPlaceName: "Haneda",
    arrLat: 35,
    arrLng: 139,
  });
  expect(deriveAnchors([f], "2026-07-05", overrides).start).toEqual({
    bookingId: null,
    placeName: "Friend's place",
    lat: 9,
    lng: 9,
  });
});

test("a cleared override (absent, or null homeBasePlaceName) reverts to the computed anchor", () => {
  const hotel = lodging({
    id: "h",
    date: "2026-07-04",
    endDate: "2026-07-07",
    placeName: "Hotel",
    lat: 1,
    lng: 2,
  });
  const ref = { bookingId: "h", placeName: "Hotel", lat: 1, lng: 2 };
  // Absent from the map → computed.
  expect(deriveAnchors([hotel], "2026-07-05", NO_OVERRIDES).end).toEqual(ref);
  // Present but null homeBasePlaceName → also computed.
  const cleared = new Map<string, DayOverride>([
    ["2026-07-05", override({ homeBasePlaceName: null })],
  ]);
  expect(deriveAnchors([hotel], "2026-07-05", cleared).end).toEqual(ref);
});

test("an overnight flight arriving day N anchors START(N) at the arrival place", () => {
  const f = flight({
    id: "fl",
    date: "2026-07-04",
    endDate: "2026-07-05",
    arrPlaceName: "Haneda",
    arrLat: 35,
    arrLng: 139,
  });
  expect(deriveAnchors([f], "2026-07-05", NO_OVERRIDES).start).toEqual({
    bookingId: "fl",
    placeName: "Haneda",
    lat: 35,
    lng: 139,
  });
  // On its own departure day it does NOT anchor START.
  expect(deriveAnchors([f], "2026-07-04", NO_OVERRIDES).start).toBeNull();
});

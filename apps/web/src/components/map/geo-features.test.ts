import type { Activity } from "@caravan/shared";
import { expect, test } from "vitest";
import {
  buildDayGroups,
  buildListGroups,
  isPlotted,
  type MapPin,
  PIN_NUMBER_LAYOUT,
  stopNumbersByDay,
  toFeatureCollection,
  toMapPins,
  UNLISTED_LIST_KEY,
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
    // V2.4 booking fields — all nullable; only flight/lodging rows populate them.
    endDate: null,
    confirmationCode: null,
    arrPlaceName: null,
    arrAddress: null,
    arrLat: null,
    arrLng: null,
    arrPlaceProvider: null,
    arrPlaceRef: null,
    flightNumber: null,
    createdBy: "c".repeat(32),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/** Minimal MapPin builder for the GeoJSON-shape tests. */
function pin(over: Partial<MapPin>): MapPin {
  return {
    id: "a".repeat(32),
    title: "Somewhere",
    category: "other",
    lat: 1,
    lng: 2,
    date: null,
    listId: null,
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

test("isPlotted: a flight is plotted from EITHER endpoint", () => {
  // Departure only, arrival only, both — all plotted; neither → not.
  expect(isPlotted(activity({ type: "flight", lat: 1, lng: 2 }))).toBe(true);
  expect(isPlotted(activity({ type: "flight", arrLat: 3, arrLng: 4 }))).toBe(true);
  expect(isPlotted(activity({ type: "flight", lat: 1, lng: 2, arrLat: 3, arrLng: 4 }))).toBe(true);
  expect(isPlotted(activity({ type: "flight" }))).toBe(false);
  // Arrival coords only matter for a flight — a non-flight ignores arr*.
  expect(isPlotted(activity({ type: "lodging", arrLat: 3, arrLng: 4 }))).toBe(false);
});

test("unplottedWithPlace: named-but-uncoordinated only", () => {
  const named = activity({ placeName: "Hidden café" });
  const coordinated = activity({ id: "d".repeat(32), placeName: "Pinned", lat: 1, lng: 2 });
  const bare = activity({ id: "e".repeat(32) }); // no name → not shown as unplotted
  const out = unplottedWithPlace([named, coordinated, bare]);
  expect(out).toEqual([named]);
});

test("toMapPins: one pin per plotted non-booking activity, carrying number + category", () => {
  const pins = toMapPins(
    [
      activity({
        id: fid("1"),
        title: "Belém",
        category: "sights",
        date: "2026-07-04",
        lat: 38.7,
        lng: -9.2,
      }),
    ],
    stopNumbersByDay([activity({ id: fid("1"), date: "2026-07-04", lat: 38.7, lng: -9.2 })]),
  );
  expect(pins).toHaveLength(1);
  expect(pins[0]).toMatchObject({
    id: fid("1"),
    title: "Belém",
    category: "sights",
    lat: 38.7,
    lng: -9.2,
    date: "2026-07-04",
    number: 1,
  });
});

test("toMapPins: numbered pins are a subset of rail numbers, never a renumber", () => {
  // An UNPLOTTED stop sits between two plotted ones in the day's order. It still
  // consumes its rail number (#2), so the plotted pins must read 1 and 3.
  const a = activity({ id: fid("a"), date: "2026-07-04", position: "a0", lat: 1, lng: 2 });
  const b = activity({ id: fid("b"), date: "2026-07-04", position: "a1" }); // unplotted (no coords)
  const c = activity({ id: fid("c"), date: "2026-07-04", position: "a2", lat: 3, lng: 4 });
  const pins = toMapPins([a, b, c], stopNumbersByDay([a, b, c]));
  expect(pins.map((p) => p.number)).toEqual([1, 3]);
});

test("toMapPins: a flight emits a departure pin on date and an arrival pin on endDate", () => {
  const flight = activity({
    id: fid("f"),
    type: "flight",
    category: "transport",
    title: "LIS → HND",
    date: "2026-07-04",
    endDate: "2026-07-05",
    placeName: "Lisbon",
    lat: 38.77,
    lng: -9.13,
    arrPlaceName: "Haneda",
    arrLat: 35.55,
    arrLng: 139.78,
  });
  const pins = toMapPins([flight], stopNumbersByDay([flight]));
  expect(pins).toHaveLength(2);
  const [dep, arr] = pins;
  // Departure: place* coords on `date`.
  expect(dep).toMatchObject({
    id: fid("f"),
    title: "LIS → HND",
    category: "transport",
    lat: 38.77,
    lng: -9.13,
    date: "2026-07-04",
  });
  // Arrival: arr* coords on `endDate`, labelled by the arrival place.
  expect(arr).toMatchObject({
    id: fid("f"),
    title: "Haneda",
    category: "transport",
    lat: 35.55,
    lng: 139.78,
    date: "2026-07-05",
  });
  // Bookings are never numbered.
  expect(dep).not.toHaveProperty("number");
  expect(arr).not.toHaveProperty("number");
});

test("toMapPins: a flight emits only the endpoint(s) that have coordinates", () => {
  const depOnly = activity({ id: fid("1"), type: "flight", date: "2026-07-04", lat: 1, lng: 2 });
  const arrOnly = activity({
    id: fid("2"),
    type: "flight",
    date: "2026-07-04",
    endDate: "2026-07-05",
    arrLat: 3,
    arrLng: 4,
  });
  expect(toMapPins([depOnly])).toEqual([
    expect.objectContaining({ lat: 1, lng: 2, date: "2026-07-04" }),
  ]);
  expect(toMapPins([arrOnly])).toEqual([
    expect.objectContaining({ lat: 3, lng: 4, date: "2026-07-05" }),
  ]);
});

test("toMapPins: a lodging emits one un-numbered pin on its check-in date", () => {
  const lodging = activity({
    id: fid("l"),
    type: "lodging",
    category: "lodging",
    title: "Hotel Nikko",
    date: "2026-07-04",
    endDate: "2026-07-07",
    placeName: "Hotel Nikko",
    lat: 35.66,
    lng: 139.7,
  });
  const pins = toMapPins([lodging], stopNumbersByDay([lodging]));
  expect(pins).toHaveLength(1);
  expect(pins[0]).toMatchObject({
    id: fid("l"),
    category: "lodging",
    lat: 35.66,
    lng: 139.7,
    date: "2026-07-04", // check-in day, NOT endDate
  });
  expect(pins[0]).not.toHaveProperty("number");
});

test("toFeatureCollection: one Point feature per pin, id+title+category in props", () => {
  const fc = toFeatureCollection([
    pin({ title: "Belém", category: "sights", lat: 38.7, lng: -9.2 }),
  ]);
  expect(fc.type).toBe("FeatureCollection");
  expect(fc.features).toHaveLength(1);
  const f = fc.features[0];
  expect(f?.geometry).toEqual({ type: "Point", coordinates: [-9.2, 38.7] }); // GeoJSON is [lng, lat]
  expect(f?.properties).toMatchObject({ title: "Belém", category: "sights" });
});

test("toFeatureCollection: attaches `number` only when the pin carries one", () => {
  const fc = toFeatureCollection([pin({ number: 2 }), pin({ id: fid("2") })]);
  expect(fc.features[0]?.properties?.number).toBe(2);
  expect(fc.features[1]?.properties).not.toHaveProperty("number");
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

// ---------------------------------------------------------------------------
// listId propagation (pins-by-list map layers)
// ---------------------------------------------------------------------------

test("toMapPins: an idea's listId rides on its pin", () => {
  const pins = toMapPins([activity({ listId: fid("9"), lat: 1, lng: 2 })]);
  expect(pins[0]?.listId).toBe(fid("9"));
});

test("toMapPins: an Unlisted idea carries listId null", () => {
  const pins = toMapPins([activity({ listId: null, lat: 1, lng: 2 })]);
  expect(pins[0]?.listId).toBeNull();
});

test("toMapPins: a flight carries listId on BOTH endpoint pins", () => {
  const pins = toMapPins([
    activity({
      type: "flight",
      listId: fid("9"),
      date: "2026-07-04",
      endDate: "2026-07-05",
      lat: 1,
      lng: 2,
      arrLat: 3,
      arrLng: 4,
    }),
  ]);
  expect(pins).toHaveLength(2);
  expect(pins[0]?.listId).toBe(fid("9"));
  expect(pins[1]?.listId).toBe(fid("9"));
});

test("toMapPins: a dated stop still carries its listId", () => {
  // listId is set on the pin regardless of dating; the LAYER grouping (not the
  // pin) decides that dated pins group by day and undated ones by list.
  const pins = toMapPins([
    activity({ listId: fid("9"), date: "2026-07-04", lat: 1, lng: 2 }),
    activity({ id: fid("2"), listId: null, date: "2026-07-04", lat: 3, lng: 4 }),
  ]);
  expect(pins[0]?.listId).toBe(fid("9"));
  expect(pins[1]?.listId).toBeNull();
});

test("toFeatureCollection: emits `date` on every feature (null for undated)", () => {
  const fc = toFeatureCollection([pin({ date: "2026-07-04" }), pin({ id: fid("2"), date: null })]);
  expect(fc.features[0]?.properties?.date).toBe("2026-07-04");
  // Present-but-null, so the day-color `match` falls through to its fallback arm.
  expect(fc.features[1]?.properties).toHaveProperty("date", null);
});

// ---------------------------------------------------------------------------
// buildDayGroups / buildListGroups (map layers control)
// ---------------------------------------------------------------------------

const label = (iso: string) => `label:${iso}`;

test("buildDayGroups: empty pins → no groups", () => {
  expect(buildDayGroups([], label)).toEqual([]);
});

test("buildDayGroups: dated-only pins group ascending with counts", () => {
  const groups = buildDayGroups(
    [
      pin({ date: "2026-07-05" }),
      pin({ date: "2026-07-04" }),
      pin({ date: "2026-07-05" }),
      pin({ date: "2026-07-05" }),
    ],
    label,
  );
  expect(groups).toEqual([
    { key: "2026-07-04", label: "label:2026-07-04", count: 1 },
    { key: "2026-07-05", label: "label:2026-07-05", count: 3 },
  ]);
});

test("buildDayGroups: undated pins never enter day groups", () => {
  const groups = buildDayGroups([pin({ date: "2026-07-04" }), pin({ date: null })], label);
  expect(groups).toEqual([{ key: "2026-07-04", label: "label:2026-07-04", count: 1 }]);
});

test("buildListGroups: empty pins → no groups", () => {
  expect(buildListGroups([], [{ id: fid("9"), name: "Museums" }])).toEqual([]);
});

test("buildListGroups: rows follow the ideaLists (display) order, not pin order", () => {
  const groups = buildListGroups(
    [pin({ listId: fid("2") }), pin({ listId: fid("1") }), pin({ listId: fid("2") })],
    [
      { id: fid("1"), name: "Food" },
      { id: fid("2"), name: "Museums" },
    ],
  );
  expect(groups).toEqual([
    { key: fid("1"), label: "Food", count: 1 },
    { key: fid("2"), label: "Museums", count: 2 },
  ]);
});

test("buildListGroups: Unlisted-only pins yield a single Unlisted row", () => {
  const groups = buildListGroups([pin({ listId: null }), pin({ listId: null })], []);
  expect(groups).toEqual([{ key: UNLISTED_LIST_KEY, label: "Unlisted", count: 2 }]);
});

test("buildListGroups: mixed — lists in order, Unlisted last, dated pins excluded", () => {
  const groups = buildListGroups(
    [
      pin({ listId: null }),
      pin({ listId: fid("1") }),
      // Dated → belongs to a day group, never a list group, even with a listId.
      pin({ listId: fid("1"), date: "2026-07-04" }),
      pin({ listId: null, date: "2026-07-04" }),
    ],
    [{ id: fid("1"), name: "Food" }],
  );
  expect(groups).toEqual([
    { key: fid("1"), label: "Food", count: 1 },
    { key: UNLISTED_LIST_KEY, label: "Unlisted", count: 1 },
  ]);
});

test("buildListGroups: a list with zero pinned ideas is omitted", () => {
  const groups = buildListGroups(
    [pin({ listId: fid("1") })],
    [
      { id: fid("1"), name: "Food" },
      { id: fid("2"), name: "Empty list" },
    ],
  );
  expect(groups).toEqual([{ key: fid("1"), label: "Food", count: 1 }]);
});

// ---------------------------------------------------------------------------
// pin-number collision tuning (regression guard)
// ---------------------------------------------------------------------------

test("PIN_NUMBER_LAYOUT: native collision stays ON, tuned to actual overlaps only", () => {
  // Regression guard against reverting to "always show" — allow-overlap true let
  // half-overlapping numbers merge into unreadable glyph soup. With collision on
  // and a tight 1px padding, only a genuinely covered pin loses its number (and
  // its circle stays visible/clickable).
  expect(PIN_NUMBER_LAYOUT["text-allow-overlap"]).toBe(false);
  expect(PIN_NUMBER_LAYOUT["text-ignore-placement"]).toBe(false);
  expect(PIN_NUMBER_LAYOUT["text-padding"]).toBe(1);
  // Deterministic tie-break: earlier stops in a day win a collision.
  expect(PIN_NUMBER_LAYOUT["symbol-sort-key"]).toEqual(["get", "number"]);
});

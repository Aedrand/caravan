import type { Activity, ActivityCategory } from "@caravan/shared";
import type { FeatureCollection } from "geojson";
// Type-only import — erased at compile time, so this file stays runtime-free of
// maplibre (same idiom as route-features.ts's ExpressionSpecification import).
import type { SymbolLayerSpecification } from "maplibre-gl";
// Relative (not the `@/` alias) so this stays resolvable in the vitest run
// regardless of alias wiring — the rest of the test suite imports relatively
// too. We IMPORT the shared numbering helper; we never reach into it.
import { computeStopNumbers } from "../itinerary/numbering";

/**
 * Pure map-data helpers (Track C), split from the MapPanel so they're testable
 * without a DOM or maplibre. An ordinary item is "plotted" only with its own
 * coordinates; a flight is plotted from EITHER endpoint (V2.4 bookings). The
 * normalized render unit is a {@link MapPin} (see {@link toMapPins}) — a flight
 * expands to two pins, so coordinates + day live on the pin, not the activity.
 */

export type Plotted = Activity & { lat: number; lng: number };

function hasCoords(lat: number | null, lng: number | null): boolean {
  return lat != null && lng != null;
}

/**
 * Does this activity put at least one pin on the map? An ordinary item needs its
 * own `lat`/`lng`; a **flight** counts if EITHER its departure (`lat`/`lng`) OR
 * its arrival (`arrLat`/`arrLng`) is coordinated (V2.4 — a flight shows even when
 * only one endpoint geocoded).
 *
 * This is a plain boolean predicate, NOT a type guard: an arrival-only flight has
 * null `place*` lat/lng, so narrowing to {@link Plotted} (lat/lng non-null) would
 * be unsound. For coordinate-guaranteed render points use {@link toMapPins}.
 */
export function isPlotted(a: Activity): boolean {
  return hasCoords(a.lat, a.lng) || (a.type === "flight" && hasCoords(a.arrLat, a.arrLng));
}

/** Activities with a place name but no coordinates — the "unplotted" list. */
export function unplottedWithPlace(activities: Activity[]): Activity[] {
  return activities.filter((a) => !isPlotted(a) && Boolean(a.placeName));
}

/**
 * Per-day stop numbers, merged across every day and keyed by `activity.id` — the
 * SAME numbers the itinerary rail stamps, so a map pin's number always matches
 * its rail stop (spec §C.6).
 *
 * The rail numbers each day independently (1..N over that day's *numbered* rows),
 * so we bucket by ISO `date` and run the shared {@link computeStopNumbers} per
 * day, then merge. Pass the **full** activity set, NOT just the plotted ones:
 * an unplotted (or un-placed) dated stop still occupies a rail number, and
 * feeding only the plotted subset here would renumber the map out of sync with
 * the rail. Downstream, only plotted stops get a feature/pin — so the map renders
 * a faithful *subset* of these numbers (a "missing" number reads as "not located
 * yet"), never a divergent renumbering. (Only `activity`-type rows are numbered;
 * bookings/notes/checklists never appear here — see {@link computeStopNumbers}.)
 */
export function stopNumbersByDay(activities: Activity[]): Map<string, number> {
  const byDay = new Map<string, Activity[]>();
  for (const a of activities) {
    if (a.date == null) continue; // undated (Ideas pool) → never a numbered stop
    const bucket = byDay.get(a.date);
    if (bucket) bucket.push(a);
    else byDay.set(a.date, [a]);
  }
  const numbers = new Map<string, number>();
  for (const dayItems of byDay.values()) {
    for (const [id, n] of computeStopNumbers(dayItems)) numbers.set(id, n);
  }
  return numbers;
}

/**
 * One rendered map marker, normalized from an activity. An ordinary item yields a
 * single pin; a **flight** yields up to two — a departure pin on `date` (at the
 * departure place, `place*`) and an arrival pin on `endDate` (at the arrival
 * place, `arr*`). Each pin carries its OWN `date` so the per-day filter / toggle
 * / framing keys on the day the marker actually belongs to (the arrival pin sits
 * on `endDate`, not the booking's `date`).
 */
export interface MapPin {
  /** The owning activity id — the selection key shared with the rail, so clicking
   *  either flight endpoint highlights the same itinerary row. */
  id: string;
  title: string;
  category: ActivityCategory;
  lat: number;
  lng: number;
  /** The day this pin sits on (drives the per-day filter); `null` = Ideas pool. */
  date: string | null;
  /** Which idea list this pin belongs to; null = Unlisted or dated. Drives the
   *  per-list layer toggle for undated (Ideas-pool) pins. */
  listId: string | null;
  /** Per-day stop number — present ONLY for numbered `activity` stops. Bookings
   *  (flight/lodging) are never numbered, so they omit it. */
  number?: number;
  /** Which flight endpoint this pin is — present ONLY on flight pins. Ground
   *  pins (stops, lodging, ideas) omit it. Drives day-focus framing: a
   *  far-away endpoint must not zoom the day out to world scale. */
  flight?: "departure" | "arrival";
}

/**
 * Expand the activity set into render pins (V2.4). Each plotted item becomes a
 * {@link MapPin}; a flight fans out into its departure + arrival pins. Pass
 * `stopNumbers` from {@link stopNumbersByDay} (computed over the FULL set) so the
 * numbered stops carry their rail number; bookings deliberately carry none.
 *
 * - **flight**: a departure pin (place*) on `date` and/or an arrival pin (arr*)
 *   on `endDate` — only the endpoint(s) that have coordinates. Un-numbered; both
 *   keep the flight's `id` (rail cross-highlight) and `category` (transport tint).
 * - **lodging**: one pin at its place (place*) on its check-in `date`.
 *   Un-numbered; lodging `category` tint.
 * - **activity / note / checklist**: one pin at its place; a numbered `activity`
 *   stop carries its number, everything else renders un-numbered.
 */
export function toMapPins(activities: Activity[], stopNumbers?: Map<string, number>): MapPin[] {
  const pins: MapPin[] = [];
  for (const a of activities) {
    if (a.type === "flight") {
      // A flight is two endpoints, not a numbered stop. The departure rides on
      // `date`; the arrival rides on `endDate` — so the per-day toggle hides each
      // on its own day. Emit only the endpoint(s) that actually geocoded.
      if (a.lat != null && a.lng != null) {
        pins.push({
          id: a.id,
          title: a.title,
          category: a.category,
          lat: a.lat,
          lng: a.lng,
          date: a.date,
          listId: a.listId ?? null,
          flight: "departure",
        });
      }
      if (a.arrLat != null && a.arrLng != null) {
        pins.push({
          id: a.id,
          title: a.arrPlaceName ?? a.title,
          category: a.category,
          lat: a.arrLat,
          lng: a.arrLng,
          date: a.endDate,
          listId: a.listId ?? null,
          flight: "arrival",
        });
      }
      continue;
    }
    if (a.lat == null || a.lng == null) continue;
    // Lodging is one un-numbered place pin on its check-in `date`; everything else
    // pins at its place, and only a numbered `activity` stop carries a number.
    const number = a.type === "lodging" ? undefined : stopNumbers?.get(a.id);
    pins.push({
      id: a.id,
      title: a.title,
      category: a.category,
      lat: a.lat,
      lng: a.lng,
      date: a.date,
      listId: a.listId ?? null,
      ...(number == null ? {} : { number }),
    });
  }
  return pins;
}

/** Great-circle distance in km (haversine). Good enough for "is this airport
 *  near this day's stops" — no geodesic precision needed. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** A flight endpoint within this distance of the day's ground pins still joins
 *  the day-focus frame (a regional airport is part of the day; KIX↔Kyoto is
 *  ~90 km). Beyond it, the endpoint is a different part of the world. */
export const FLIGHT_ENDPOINT_NEAR_KM = 150;

/**
 * The pins a focused day should FRAME (not render — every pin stays on the
 * map; this only picks what drives `fitBounds`). A day with a long-haul
 * flight otherwise frames both endpoints and zooms out to world scale, which
 * buries the day the user actually asked to see.
 *
 * - Ground pins (stops, lodging) always frame.
 * - A flight endpoint frames only while it's within
 *   {@link FLIGHT_ENDPOINT_NEAR_KM} of the ground pins' centroid — so the
 *   local airport joins the frame on both the outbound day (arrival) and the
 *   return day (departure), and the far endpoint never does.
 * - A pure travel day (no ground pins) frames the arrival endpoint(s) — the
 *   day ends where you land; fall back to everything if nothing arrived.
 */
export function pinsForDayFocus(dayPins: MapPin[]): MapPin[] {
  const ground = dayPins.filter((p) => p.flight === undefined);
  if (ground.length === 0) {
    const arrivals = dayPins.filter((p) => p.flight === "arrival");
    return arrivals.length > 0 ? arrivals : dayPins;
  }
  const cLat = ground.reduce((s, p) => s + p.lat, 0) / ground.length;
  const cLng = ground.reduce((s, p) => s + p.lng, 0) / ground.length;
  return dayPins.filter(
    (p) =>
      p.flight === undefined || distanceKm(cLat, cLng, p.lat, p.lng) <= FLIGHT_ENDPOINT_NEAR_KM,
  );
}

/**
 * GeoJSON for the clustered pin source. Properties carry `id` + `title` (popup) +
 * `category` (category ring tint) + `date` (day-color fill), and — only when
 * present — the per-day stop `number` for the numbered symbol layer (§C.6).
 * Build pins with {@link toMapPins}; a pin without a `number` (every booking,
 * plus any un-numbered row) renders as a tinted but un-numbered marker.
 */
export function toFeatureCollection(pins: MapPin[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((pin) => {
      // `category` rides on every pin so the map can ring-tint it by category —
      // the JS token bridge in pin-tint.ts reads the `--cat-*` tokens and feeds a
      // `match` keyed on this property (V2.3, demoted fill→stroke by the
      // pins-by-day pass). `date` rides along too: the pin FILL is a day-color
      // `match` on it, and a null/unmatched date simply falls through to the
      // expression's fallback arm (the neutral idea-pin color) — no
      // special-casing. Both are always present, unlike `number`, which is
      // attached only for numbered stops so the symbol layer's
      // `["has", "number"]` filter cleanly distinguishes them from bookings.
      const base = { id: pin.id, title: pin.title, category: pin.category, date: pin.date };
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
        properties: pin.number == null ? base : { ...base, number: pin.number },
      };
    }),
  };
}

/**
 * Layout for the "pin-numbers" symbol layer, extracted so a unit test can guard
 * the collision tuning. Native symbol collision is ON (V2.8 map pass): when pins
 * crowd, the LOWER-numbered label wins and the loser's number is culled CLEANLY
 * (its circle stays visible/clickable) — strictly better than the previous
 * "always show" (`text-allow-overlap: true`), which let half-overlapping numbers
 * merge into unreadable glyph soup. `text-padding: 1` keeps the collision box
 * tight so only ACTUAL overlaps cull a label, not near-misses.
 */
export const PIN_NUMBER_LAYOUT: NonNullable<SymbolLayerSpecification["layout"]> = {
  "text-field": ["to-string", ["get", "number"]],
  "text-size": 12,
  "text-allow-overlap": false,
  "text-ignore-placement": false,
  // Conservative: only ACTUAL overlaps cull a label, not near-misses.
  "text-padding": 1,
  // Deterministic tie-break — earlier stops in a day win a collision.
  "symbol-sort-key": ["get", "number"],
};

/**
 * Paint for the "pin-numbers" symbol layer. The circle under the number is
 * day-color filled, so the white number keeps a translucent dark halo to stay
 * legible on the lighter day hues (e.g. goldenrod). Literal palette values —
 * paint can't read CSS vars, and white+dark-halo reads on every fill in both
 * color themes.
 */
export const PIN_NUMBER_PAINT: NonNullable<SymbolLayerSpecification["paint"]> = {
  "text-color": "#fffbf1",
  "text-halo-color": "rgba(40,30,18,0.55)",
  "text-halo-width": 1.3,
  "text-halo-blur": 0.3,
};

/**
 * One toggle row in the map layers control (Days / Lists groups): a stable
 * `key` (ISO date, list id, or {@link UNLISTED_LIST_KEY}), a human `label`, and
 * how many pins it owns.
 */
export interface LayerGroup {
  key: string;
  label: string;
  count: number;
}

/**
 * Day groups for the layers control: unique dated days ascending, each with its
 * pin count. Undated (Ideas-pool) pins never enter here — they're grouped by
 * idea list via {@link buildListGroups} instead. `formatLabel` renders the ISO
 * key for display (kept injected so this stays a pure, date-lib-free builder).
 */
export function buildDayGroups(pins: MapPin[], formatLabel: (iso: string) => string): LayerGroup[] {
  const counts = new Map<string, number>();
  for (const p of pins) {
    if (p.date === null) continue;
    counts.set(p.date, (counts.get(p.date) ?? 0) + 1);
  }
  return [...counts.keys()]
    .sort()
    .map((key) => ({ key, label: formatLabel(key), count: counts.get(key) ?? 0 }));
}

/** Group key for undated pins that belong to no idea list ("Unlisted"). The
 *  empty string can't collide with a real list id (ids are 32-char). */
export const UNLISTED_LIST_KEY = "";

/**
 * Idea-list groups for the layers control: one row per idea list that actually
 * owns ≥1 undated pin, in the caller's `ideaLists` order (sorted by `position`
 * upstream — display order), then an "Unlisted" row last if any undated pin has
 * no list. Dated pins never enter here (they belong to day groups); a list with
 * zero pinned ideas is omitted (nothing on the map to toggle).
 */
export function buildListGroups(
  pins: MapPin[],
  ideaLists: { id: string; name: string }[],
): LayerGroup[] {
  const counts = new Map<string, number>();
  for (const p of pins) {
    if (p.date !== null) continue;
    const key = p.listId ?? UNLISTED_LIST_KEY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = ideaLists
    .filter((l) => counts.has(l.id))
    .map((l) => ({ key: l.id, label: l.name, count: counts.get(l.id) as number }));
  const unlisted = counts.get(UNLISTED_LIST_KEY);
  if (unlisted) rows.push({ key: UNLISTED_LIST_KEY, label: "Unlisted", count: unlisted });
  return rows;
}

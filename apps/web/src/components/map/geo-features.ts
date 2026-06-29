import type { Activity, ActivityCategory } from "@caravan/shared";
import type { FeatureCollection } from "geojson";
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
  /** Per-day stop number — present ONLY for numbered `activity` stops. Bookings
   *  (flight/lodging) are never numbered, so they omit it. */
  number?: number;
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
      ...(number == null ? {} : { number }),
    });
  }
  return pins;
}

/**
 * GeoJSON for the clustered pin source. Properties carry `id` + `title` (popup) +
 * `category` (pin tint), and — only when present — the per-day stop `number` for
 * the numbered symbol layer (§C.6). Build pins with {@link toMapPins}; a pin
 * without a `number` (every booking, plus any un-numbered row) renders as a
 * category-tinted but un-numbered marker.
 */
export function toFeatureCollection(pins: MapPin[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((pin) => {
      // `category` rides on every pin so the map can tint it by category — the JS
      // token bridge in map-panel reads the `--cat-*` tokens and feeds a `match`
      // keyed on this property (V2.3 pin tint). It's always present, unlike
      // `number`, which is attached only for numbered stops so the symbol layer's
      // `["has", "number"]` filter cleanly distinguishes them from bookings.
      const base = { id: pin.id, title: pin.title, category: pin.category };
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
        properties: pin.number == null ? base : { ...base, number: pin.number },
      };
    }),
  };
}

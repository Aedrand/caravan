import type { Activity } from "@caravan/shared";
import type { FeatureCollection } from "geojson";
// Relative (not the `@/` alias) so this stays resolvable in the vitest run
// regardless of alias wiring — the rest of the test suite imports relatively
// too. We IMPORT the shared numbering helper; we never reach into it.
import { computeStopNumbers } from "../itinerary/numbering";

/**
 * Pure map-data helpers (Track C), split from the MapPanel so they're testable
 * without a DOM or maplibre. An activity is "plotted" only with both
 * coordinates; everything else is unplotted (normal — PD-1/TD-5).
 */

export type Plotted = Activity & { lat: number; lng: number };

export function isPlotted(a: Activity): a is Plotted {
  return a.lat != null && a.lng != null;
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
 * yet"), never a divergent renumbering.
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
 * GeoJSON for the clustered pin source. Properties carry `id` + `title` (popup)
 * and, when known, the per-day stop `number` for the numbered symbol layer —
 * the same number the rail stamps (§C.6). Pass `stopNumbers` from
 * {@link stopNumbersByDay}; a plotted stop absent from it (shouldn't happen for a
 * dated activity) just renders an un-numbered pin.
 */
export function toFeatureCollection(
  plotted: Plotted[],
  stopNumbers?: Map<string, number>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: plotted.map((a) => {
      const number = stopNumbers?.get(a.id);
      // `category` rides on every pin so the map can tint it by category — the JS
      // token bridge in map-panel reads the `--cat-*` tokens and feeds a `match`
      // keyed on this property (V2.3 pin tint). It's always present (notNull on
      // the record), so it's unconditional, unlike `number`.
      const base = { id: a.id, title: a.title, category: a.category };
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [a.lng, a.lat] },
        // Only attach `number` when present so the symbol layer's `["has",
        // "number"]` filter cleanly distinguishes numbered pins.
        properties: number == null ? base : { ...base, number },
      };
    }),
  };
}

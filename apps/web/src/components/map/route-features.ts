import type { RouteResult } from "@caravan/shared";
import type { Feature, FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";

/**
 * Pure map-data helpers for per-day route lines (Trip Workspace V2.5 — Routing).
 * Split from MapPanel so they're testable without a DOM or maplibre: one builds
 * the `LineString` source (the data layer), the other builds the `line-color`
 * paint expression (the style layer).
 *
 * A day's route is the road/footpath polyline through that day's ordered stops,
 * tinted by which day it belongs to so adjacent days read as distinct ribbons on
 * the canvas. The per-day filter mirrors the pin layer: it rebuilds the
 * FeatureCollection at the DATA level off a `hiddenDays: Set<string>` of ISO
 * dates (the same toggle the pins honour), rather than fighting MapLibre filters.
 */

/**
 * Day-route line colors. Eight visually distinct hues kept in a muted, warm
 * "travel poster" register so they harmonise with the warm theme while staying
 * tellable-apart day to day. These are RAW hex on purpose: MapLibre paint CANNOT
 * read CSS custom properties, so — exactly like {@link PIN_FALLBACK_COLOR} in
 * pin-tint.ts — the line colors live as literals here, not as `--var` tokens.
 * The first entry shares the pin fallback's terracotta so a one-day trip's line
 * sits in the same family as its pins.
 */
export const DAY_ROUTE_PALETTE: string[] = [
  "#c05621", // burnt orange (terracotta)
  "#2c7a7b", // deep teal
  "#b7791f", // goldenrod / ochre
  "#9b2c2c", // brick red
  "#2f855a", // pine green
  "#2b6cb0", // steel blue
  "#6b46c1", // plum
  "#b83280", // rose
];

/**
 * Neutral fallback for the `match`'s trailing default: a feature whose `date` is
 * absent or unmapped (shouldn't happen for a real day route, but keeps MapLibre
 * from receiving a labelless `match`) draws in grey rather than vanishing.
 */
export const DAY_ROUTE_FALLBACK_COLOR = "#a0aec0";

/**
 * Stable color for a day at ordinal `index` (0-based over the trip's ordered
 * dates), wrapping the palette with modulo so trips longer than the palette reuse
 * hues. Any non-finite / negative / fractional index degrades to the first color
 * rather than producing an out-of-range read.
 */
export function dayColorForIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0)
    return DAY_ROUTE_PALETTE[0] ?? DAY_ROUTE_FALLBACK_COLOR;
  return DAY_ROUTE_PALETTE[index % DAY_ROUTE_PALETTE.length] ?? DAY_ROUTE_FALLBACK_COLOR;
}

/**
 * Build the route `line-color` paint: a `match` on each line's `date` property →
 * its {@link dayColorForIndex} color, falling back to {@link DAY_ROUTE_FALLBACK_COLOR}.
 *
 * Mirrors `pinColorExpression` in pin-tint.ts — a spread-built `match`
 * (`[op, input, label1, out1, …, fallback]`) bridged through `unknown` because
 * the flat `string[]` can't narrow to MapLibre's recursive literal-tuple
 * `ExpressionSpecification` (the runtime shape is a valid match).
 *
 * Empty-dates guard: a `match` with no label/output pair is malformed, so with no
 * dates we return a constant `["to-color", fallback]` expression instead — a
 * well-formed expression that always yields the fallback grey.
 */
export function dayColorExpression(orderedDates: string[]): ExpressionSpecification {
  if (orderedDates.length === 0) {
    return ["to-color", DAY_ROUTE_FALLBACK_COLOR] as unknown as ExpressionSpecification;
  }
  const branches: string[] = [];
  for (let i = 0; i < orderedDates.length; i++) {
    const date = orderedDates[i];
    if (date === undefined) continue;
    branches.push(date, dayColorForIndex(i));
  }
  return [
    "match",
    ["get", "date"],
    ...branches,
    DAY_ROUTE_FALLBACK_COLOR,
  ] as unknown as ExpressionSpecification;
}

/**
 * GeoJSON for the day-route line source: one `LineString` per VISIBLE day. Honors
 * the same per-day toggle as the pins by skipping any date in `hiddenDays`, so a
 * hidden day drops its line at the data level. Each feature's geometry is the
 * route's `geometry` AS-IS — already `[lng, lat]` (GeoJSON order) — and threads
 * `date` into `properties` so {@link dayColorExpression} can tint it.
 *
 * A route with `< 2` geometry points can't form a line, so it's skipped (a
 * single-stop day, or a graceful-off route, contributes no ribbon).
 */
export function buildRouteFeatureCollection(
  dayRoutes: Map<string, RouteResult>,
  hiddenDays: Set<string>,
): FeatureCollection {
  const features: Feature[] = [];
  for (const [date, route] of dayRoutes) {
    if (hiddenDays.has(date)) continue;
    if (route.geometry.length < 2) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: route.geometry },
      properties: { date },
    });
  }
  return { type: "FeatureCollection", features };
}

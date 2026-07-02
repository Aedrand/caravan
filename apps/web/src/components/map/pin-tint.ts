import { ACTIVITY_CATEGORIES, type ActivityCategory } from "@caravan/shared";
import type { ExpressionSpecification } from "maplibre-gl";
import { dayColorExpression } from "./route-features";

/**
 * JS token bridge for category-tinted map pins (Trip Workspace v2).
 *
 * MapLibre paint expressions CANNOT read CSS custom properties, so we read the
 * resolved category colors off the themed root at runtime and feed concrete
 * color strings into a `match` expression keyed on each pin's `category`.
 *
 * The tint MUST match how categories are colored elsewhere: this mirrors
 * `CATEGORY_META` in apps/web/src/components/itinerary/categories.ts (the visual
 * source of truth) so a pin's category ring lines up with its rail stop's glyph
 * (the pin FILL is day-colored — see `dayColorExpression`). The
 * values below are the SAME semantic tokens the rail consumes — `--cat-activity`
 * / `--cat-shopping` / `--cat-other` were added to index.css to round out the
 * `--cat-*` family (they alias `--info` / `--primary` / `--muted-foreground`,
 * exactly what CATEGORY_META uses for those three).
 */
const CATEGORY_TINT_TOKEN: Record<ActivityCategory, string> = {
  food: "--cat-food",
  sights: "--cat-sight",
  activity: "--cat-activity",
  transport: "--cat-transport",
  lodging: "--cat-lodging",
  shopping: "--cat-shopping",
  other: "--cat-other",
};

/**
 * The original single-pin orange (pre-tint). Paint can't read CSS vars, so this
 * stays a literal — it's the `match` fallback for a feature whose `category` is
 * absent or unrecognised. Every real activity carries one of the 7 known
 * categories (notNull on the record), so this only guards future/garbage values.
 */
export const PIN_FALLBACK_COLOR = "#c05621";

/** Fill for undated (Ideas-pool) pins that belong to NO idea list ("Unlisted")
 *  — neutral, deliberately outside both hue ramps AND distinct from
 *  DAY_ROUTE_FALLBACK_COLOR (that one means "shouldn't happen"; this one is a
 *  normal, expected state). Literal hex — paint can't read CSS vars. */
export const IDEA_PIN_COLOR = "#57606f";

/**
 * Idea-list pin colors (pin-color sync pass). Eight hues in a muted, COOL
 * register — plum, slate blue, teal-gray, mauve, steel, moss, dusty indigo,
 * cool taupe — deliberately a different temperature family from the warm
 * "travel poster" day ramp ({@link DAY_ROUTE_PALETTE} in route-features.ts), so
 * an undated idea pin can never be mistaken for a dated day pin. All mid-to-dark
 * (white text/dots stay legible on every entry). RAW hex on purpose: MapLibre
 * paint CANNOT read CSS custom properties, so — exactly like the day ramp —
 * these live as literals, not `--var` tokens.
 */
export const LIST_PIN_PALETTE: string[] = [
  "#6d597f", // dusty plum
  "#56698f", // slate blue
  "#5b7478", // teal-gray
  "#8a5f74", // mauve
  "#5c7186", // steel
  "#5f7355", // moss
  "#5a5f8d", // dusty indigo
  "#776f66", // cool taupe
];

/**
 * Stable color for the idea list at ordinal `index` (0-based over the trip's
 * position-sorted lists — the same order IdeasPanel renders), wrapping the
 * palette with modulo so a trip with more than 8 lists reuses hues. Mirrors
 * `dayColorForIndex` in route-features.ts: any non-finite / negative /
 * fractional index degrades to the first color rather than an out-of-range read.
 */
export function listColorForIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) return LIST_PIN_PALETTE[0] ?? IDEA_PIN_COLOR;
  return LIST_PIN_PALETTE[index % LIST_PIN_PALETTE.length] ?? IDEA_PIN_COLOR;
}

/**
 * Build the list-color paint expression: a `match` on each feature's `listId`
 * property → its {@link listColorForIndex} color, falling back to
 * `fallbackColor` (default {@link IDEA_PIN_COLOR}) — an Unlisted pin's
 * `listId: null` never matches a branch, so it lands on the fallback arm by
 * design, no special-casing. Same idiom as `dayColorExpression`
 * (route-features.ts), including the empty-branches guard: a `match` with no
 * label/output pair is malformed (throws at addLayer/setPaintProperty time), so
 * with no lists we return a constant `["to-color", fallback]` instead.
 */
export function listColorExpression(
  orderedListIds: string[],
  fallbackColor: string = IDEA_PIN_COLOR,
): ExpressionSpecification {
  if (orderedListIds.length === 0) {
    return ["to-color", fallbackColor] as unknown as ExpressionSpecification;
  }
  const branches: string[] = [];
  for (let i = 0; i < orderedListIds.length; i++) {
    const listId = orderedListIds[i];
    if (listId === undefined) continue;
    branches.push(listId, listColorForIndex(i));
  }
  return [
    "match",
    ["get", "listId"],
    ...branches,
    fallbackColor,
  ] as unknown as ExpressionSpecification;
}

/**
 * The pins layer's composed `circle-color` fill: dated pins color by DAY (the
 * same `match` on `date`, over the same canonical trip-day order, that tints the
 * route lines), and undated (Ideas-pool) pins fall through to a nested `match`
 * on `listId` → their idea list's cool-ramp color, with truly unlisted/unknown
 * pins landing on the neutral {@link IDEA_PIN_COLOR}. Pure composition of the
 * two single-key expressions, so each stays independently testable; both guards
 * hold — a zero-branch `match` is never produced at either level.
 */
export function pinFillExpression(
  orderedDates: string[],
  orderedListIds: string[],
): ExpressionSpecification {
  return dayColorExpression(orderedDates, listColorExpression(orderedListIds));
}

/**
 * Read the resolved category tints off the themed root element. `<html>` carries
 * the `data-theme` (color) / `data-style` (structure) axes, and
 * `getComputedStyle().getPropertyValue` returns the fully-substituted value of
 * each `--cat-*` alias chain — so paint receives concrete color strings. An
 * empty read (token missing) degrades to the legacy orange rather than a blank
 * fill. Re-run on theme change to re-tint.
 */
export function readPinTints(
  root: HTMLElement = document.documentElement,
): Record<ActivityCategory, string> {
  const styles = getComputedStyle(root);
  const tints = {} as Record<ActivityCategory, string>;
  for (const category of ACTIVITY_CATEGORIES) {
    const value = styles.getPropertyValue(CATEGORY_TINT_TOKEN[category]).trim();
    tints[category] = value || PIN_FALLBACK_COLOR;
  }
  return tints;
}

/**
 * Build the pin category-tint paint: a `match` on the feature's `category`
 * property → its resolved tint, falling back to the legacy orange for any
 * unknown/absent category. Since the pins-by-day pass, this drives the pin's
 * `circle-stroke-color` (a category RING) — the FILL is day-colored via
 * `dayColorExpression` in route-features.ts.
 */
export function pinColorExpression(
  tints: Record<ActivityCategory, string> = readPinTints(),
): ExpressionSpecification {
  const branches: string[] = [];
  for (const category of ACTIVITY_CATEGORIES) branches.push(category, tints[category]);
  // `match` shape: [op, input, label1, out1, …, fallback]. The spread produces a
  // plain string[] that can't be narrowed to MapLibre's recursive literal-tuple
  // `ExpressionSpecification`, so bridge through `unknown` (the runtime shape is
  // a valid match expression).
  return [
    "match",
    ["get", "category"],
    ...branches,
    PIN_FALLBACK_COLOR,
  ] as unknown as ExpressionSpecification;
}

import { ACTIVITY_CATEGORIES, type ActivityCategory } from "@caravan/shared";
import type { ExpressionSpecification } from "maplibre-gl";

/**
 * JS token bridge for category-tinted map pins (Trip Workspace v2).
 *
 * MapLibre paint expressions CANNOT read CSS custom properties, so we read the
 * resolved category colors off the themed root at runtime and feed concrete
 * color strings into a `match` expression keyed on each pin's `category`.
 *
 * The tint MUST match how categories are colored elsewhere: this mirrors
 * `CATEGORY_META` in apps/web/src/components/itinerary/categories.ts (the visual
 * source of truth) so a pin's fill lines up with its rail stop's glyph. The
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
 * Build the pin `circle-color` paint: a `match` on the feature's `category`
 * property → its resolved tint, falling back to the legacy orange for any
 * unknown/absent category.
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

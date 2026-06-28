import type { Activity } from "@caravan/shared";

/**
 * Per-day sequential stop numbers (Trip Workspace v2 / Plan View v2). The rail
 * and the map share this ONE helper so a stop's number always matches between
 * the two surfaces.
 *
 * A "stop" is a dated `activity`-type item. `note` and `checklist` rows are
 * never numbered and never consume a number — they're skipped entirely.
 * Numbering follows `position` order (the same lexicographic fractional-index
 * comparison the board/ideas use), starting at 1.
 *
 * Both plotted (has lat/lng) and unplotted stops are numbered: the map only
 * draws a pin for the plotted ones, but every stop keeps the same number in the
 * rail and on the map, so the numbering can never drift between them.
 *
 * Pass a single day's items in any order and of any type. (Undated items — the
 * Ideas pool — are filtered out, so passing a mixed list yields only the dated
 * stops' numbers.)
 *
 * @returns a Map keyed by `activity.id` → its 1-based stop number for the day.
 */
export function computeStopNumbers(activitiesForDay: Activity[]): Map<string, number> {
  const stops = activitiesForDay
    .filter((a) => a.type === "activity" && a.date !== null)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

  const numbers = new Map<string, number>();
  stops.forEach((stop, index) => {
    numbers.set(stop.id, index + 1);
  });
  return numbers;
}

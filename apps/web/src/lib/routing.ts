import type {
  Activity,
  AnchorRef,
  Coord,
  RouteMode,
  RouteResponse,
  RouteResult,
} from "@caravan/shared";
import { useQuery } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { useDebounced } from "@/lib/geo";

/**
 * Web-side routing client (Trip Workspace V2.5 — Routing). Turns a day's
 * ordered stops + start/end anchors into the waypoint list the `/api/route`
 * proxy draws a line through, and exposes a debounced TanStack Query hook for
 * it. Everything here is provider-agnostic: the proxy owns the upstream costing
 * names, this side only ever speaks the shared `{ walking | driving }` wire.
 *
 * Graceful-off (TD): an unreachable/unparseable upstream is `{ route: null }`
 * at HTTP 200, so the hook surfaces a null route (pins, no line) rather than an
 * error. 400/429 throws are caught and likewise collapsed to null so the UI
 * shows the "route unavailable" state instead of a hard failure.
 */

/**
 * Assemble the ordered waypoints for a day's route:
 * `[startAnchor?, ...plottedActivityStops, endAnchor?]`.
 *
 *  - the start anchor is included only when it carries non-null lat & lng;
 *  - then every `activity`-type item with a non-null lat & lng, in `position`
 *    order (the same lexicographic fractional-index sort the board/numbering
 *    use) — notes, checklists, flights, lodgings and unplotted stops are all
 *    excluded;
 *  - the end anchor is included only when it carries non-null lat & lng.
 *
 * Returns `[]` when fewer than two coordinates result (a route needs an origin
 * and a destination).
 */
export function buildDayWaypoints(
  items: Activity[],
  anchors: { start: AnchorRef | null; end: AnchorRef | null },
): Coord[] {
  const coords: Coord[] = [];

  const { start, end } = anchors;
  if (start && start.lat !== null && start.lng !== null) {
    coords.push({ lat: start.lat, lng: start.lng });
  }

  const stops = items
    .filter((a) => a.type === "activity" && a.lat !== null && a.lng !== null)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  for (const stop of stops) {
    // lat/lng are non-null by the filter above.
    coords.push({ lat: stop.lat as number, lng: stop.lng as number });
  }

  if (end && end.lat !== null && end.lng !== null) {
    coords.push({ lat: end.lat, lng: end.lng });
  }

  return coords.length >= 2 ? coords : [];
}

/**
 * Stable cache key for a waypoint list, rounded to 5 decimal places (~1.1 m).
 * Mirrors the server's normalize-and-hash input so client and server reason
 * about the same identity for a route.
 */
export function hashWaypoints(coords: Coord[]): string {
  return coords.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join("|");
}

/**
 * Human-readable travel time, rounded to the nearest minute:
 * `"< 1 min"` under 30s, `"22 min"`, `"1 h"`, `"1 h 5 min"`.
 */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return "< 1 min";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/**
 * Human-readable distance: metres under 1 km (`"820 m"`), kilometres with one
 * decimal at/above 1 km (`"1.4 km"`).
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

const ROUTE_DEBOUNCE_MS = 1000; // settle waypoint edits before hitting the proxy.
const ROUTE_STALE_MS = 24 * 60 * 60 * 1000; // a road doesn't move; reuse for a day.

/**
 * Fetch the drawn route for a day's waypoints. Debounces the waypoint list so
 * rapid edits (drag-reorder, place picks) coalesce into one request, keys the
 * query by the rounded waypoint hash so identical geometry hits the cache, and
 * never throws — a graceful-off or an error both resolve to `null`, letting the
 * UI fall back to bare pins.
 */
export function useRouteForDay(
  tripId: string,
  date: string,
  waypoints: Coord[],
  mode: RouteMode,
): { result: RouteResult | null; isLoading: boolean; waypointCount: number } {
  const debounced = useDebounced(waypoints, ROUTE_DEBOUNCE_MS);
  const hash = hashWaypoints(debounced);
  const enabled = debounced.length >= 2;

  const query = useQuery({
    queryKey: ["route", tripId, date, mode, hash],
    queryFn: async () => {
      try {
        const data = await apiPost<RouteResponse>("/api/route", {
          waypoints: debounced,
          mode,
        });
        return data.route;
      } catch {
        // 400/429 (or any transport error) → show the unavailable state.
        return null;
      }
    },
    enabled,
    staleTime: ROUTE_STALE_MS,
    refetchOnWindowFocus: false,
  });

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    waypointCount: debounced.length,
  };
}

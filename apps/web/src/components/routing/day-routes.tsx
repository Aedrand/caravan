import type { Activity, DayOverride, RouteMode, RouteResult, TripSnapshot } from "@caravan/shared";
import { deriveAnchors, effectiveRouteMode } from "@caravan/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { deriveDays } from "@/components/itinerary/format";
import { buildDayWaypoints, useRouteForDay } from "@/lib/routing";

/**
 * The single source of per-day route results (Trip Workspace V2.5 — Routing).
 *
 * Both the itinerary rail (per-day travel-time leg labels) and the ambient map
 * (all day route lines) need the same drawn routes, so they're computed ONCE
 * here, at the common parent of `ItineraryBoard` + `MapPanel`
 * (`PlanView`), and read back through `useDayRoutes()`.
 *
 * Rules-of-Hooks safety: `deriveDays` can change length between renders (a date
 * edit, or an activity dated outside the trip range adds/removes a day), so we
 * canNOT call `useRouteForDay` in a variable-length `.map`. Instead we render one
 * fixed `DayRouteSubscriber` child per day — each component always calls exactly
 * one `useRouteForDay` (stable hook order within the component), and React is
 * free to mount/unmount whole subscribers as the day set changes. Each
 * subscriber lifts its `{ result, isLoading, mode }` into the provider's map.
 *
 * Outside a provider (the mobile Map tab renders `<MapPanel>` alone, and unit
 * tests render the board bare) `useDayRoutes()` returns an empty map — pins and
 * rows render, just without route lines or leg labels.
 */

export interface DayRouteState {
  /** The drawn route for the day, or null (graceful-off / fewer than two stops). */
  result: RouteResult | null;
  /** A route fetch is in flight for this day. */
  isLoading: boolean;
  /** The effective mode the route was fetched with (trip default ⊕ day override). */
  mode: RouteMode;
}

const DayRoutesContext = createContext<Map<string, DayRouteState> | null>(null);

/** Stable empty map so no-provider consumers don't churn on identity. */
const EMPTY: Map<string, DayRouteState> = new Map();

/** Read the per-day route map. Safe outside a provider (returns an empty map). */
export function useDayRoutes(): Map<string, DayRouteState> {
  return useContext(DayRoutesContext) ?? EMPTY;
}

/** Group a trip's activities by their ISO date (undated items are dropped). */
function groupByDate(activities: Activity[]): Map<string, Activity[]> {
  const map = new Map<string, Activity[]>();
  for (const a of activities) {
    if (!a.date) continue;
    const arr = map.get(a.date) ?? [];
    arr.push(a);
    map.set(a.date, arr);
  }
  return map;
}

interface DayInput {
  iso: string;
  /** `[startAnchor?, ...plottedStops, endAnchor?]`; `[]` when fewer than two coords. */
  waypoints: ReturnType<typeof buildDayWaypoints>;
  /** Effective routing mode for the day. */
  mode: RouteMode;
}

/**
 * The route source. Derives the stable day list + per-day waypoints/mode (the
 * SAME assembly the rail uses for its leg-index math), renders a subscriber per
 * day, and publishes the collected results to descendants.
 */
export function RoutingProvider({
  snapshot,
  children,
}: {
  snapshot: TripSnapshot;
  children: ReactNode;
}) {
  const { trip, activities, days: dayRows } = snapshot;

  const days = useMemo(
    () => deriveDays(trip.startDate, trip.endDate, activities),
    [trip.startDate, trip.endDate, activities],
  );

  const dayInputs = useMemo<DayInput[]>(() => {
    const byDate = groupByDate(activities);
    const bookings = activities.filter((a) => a.type === "flight" || a.type === "lodging");
    const overrides: Map<string, DayOverride> = new Map(dayRows.map((d) => [d.date, d]));
    const routeModeByDate = new Map(dayRows.map((d) => [d.date, d.routeMode] as const));
    return days.map((iso) => {
      const items = byDate.get(iso) ?? [];
      const anchors = deriveAnchors(bookings, iso, overrides);
      const waypoints = buildDayWaypoints(items, anchors);
      const mode = effectiveRouteMode(trip.defaultRouteMode, routeModeByDate.get(iso) ?? null);
      return { iso, waypoints, mode };
    });
  }, [days, activities, dayRows, trip.defaultRouteMode]);

  const [routes, setRoutes] = useState<Map<string, DayRouteState>>(() => new Map());

  const setDayRoute = useCallback((iso: string, state: DayRouteState) => {
    setRoutes((prev) => {
      const cur = prev.get(iso);
      if (
        cur &&
        cur.result === state.result &&
        cur.isLoading === state.isLoading &&
        cur.mode === state.mode
      ) {
        return prev; // identical — skip the re-render
      }
      const next = new Map(prev);
      next.set(iso, state);
      return next;
    });
  }, []);

  const removeDayRoute = useCallback((iso: string) => {
    setRoutes((prev) => {
      if (!prev.has(iso)) return prev;
      const next = new Map(prev);
      next.delete(iso);
      return next;
    });
  }, []);

  return (
    <>
      {dayInputs.map(({ iso, waypoints, mode }) => (
        <DayRouteSubscriber
          key={iso}
          tripId={trip.id}
          iso={iso}
          waypoints={waypoints}
          mode={mode}
          onResult={setDayRoute}
          onRemove={removeDayRoute}
        />
      ))}
      <DayRoutesContext.Provider value={routes}>{children}</DayRoutesContext.Provider>
    </>
  );
}

/**
 * One day's route subscription. Renders nothing — it exists only to own a single
 * `useRouteForDay` call with a stable hook order, lifting the result up. The
 * `key={iso}` in the provider lets React add/drop these as the day set changes
 * without disturbing any sibling's hook order.
 */
function DayRouteSubscriber({
  tripId,
  iso,
  waypoints,
  mode,
  onResult,
  onRemove,
}: {
  tripId: string;
  iso: string;
  waypoints: DayInput["waypoints"];
  mode: RouteMode;
  onResult: (iso: string, state: DayRouteState) => void;
  onRemove: (iso: string) => void;
}) {
  const { result, isLoading } = useRouteForDay(tripId, iso, waypoints, mode);

  useEffect(() => {
    onResult(iso, { result, isLoading, mode });
  }, [iso, result, isLoading, mode, onResult]);

  // Drop this day's entry when it unmounts (day removed from the list).
  useEffect(() => () => onRemove(iso), [iso, onRemove]);

  return null;
}

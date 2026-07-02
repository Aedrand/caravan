import type { Activity, IdeaList, RouteResult, TripSnapshot } from "@caravan/shared";
import type { Point } from "geojson";
import { MapPin, MapPinOff, TriangleAlert } from "lucide-react";
import maplibregl from "maplibre-gl";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { deriveDays, formatDayShort } from "@/components/itinerary/format";
import { EmptyState } from "@/components/ui/empty-state";
import { useMapConfig } from "@/lib/geo";
import { cn } from "@/lib/utils";
import "maplibre-gl/dist/maplibre-gl.css";
import { useFocusedDay } from "./focused-day";
import {
  buildDayGroups,
  buildListGroups,
  type MapPin as MapPinFeature,
  PIN_NUMBER_LAYOUT,
  PIN_NUMBER_PAINT,
  pinsForDayFocus,
  stopNumbersByDay,
  toFeatureCollection,
  toMapPins,
  UNLISTED_LIST_KEY,
  unplottedWithPlace,
} from "./geo-features";
import { MapLayersControl } from "./map-layers-control";
import {
  IDEA_PIN_COLOR,
  listColorForIndex,
  pinColorExpression,
  pinFillExpression,
  readPinTints,
} from "./pin-tint";
import {
  buildRouteFeatureCollection,
  dayColorExpression,
  dayColorForIndex,
} from "./route-features";
import { useMapSelection } from "./selection";

/**
 * Ambient trip map (C.3, TD-5). MapLibre GL + the host-configured tiles
 * (OpenFreeMap by default — keyless, CDN-served), pins for every activity with
 * coordinates, native GeoJSON clustering, and bidirectional highlight with the
 * itinerary (click a pin → its card highlights; click a card's title → fly to
 * its pin). Activities without coordinates surface in an "unplotted" affordance
 * rather than silently vanishing (PD-1: unplotted is normal).
 */

const SOURCE_ID = "activities";
/** Day route-line source/layer ids (V2.5 — Routing). The line layer sits UNDER
 * the pins/clusters so the ribbons read behind the numbered stops. */
const ROUTES_SOURCE_ID = "routes";
const ROUTE_LINE_LAYER_ID = "route-lines";

/** Stable empty default so existing call sites (and the no-route mobile Map tab)
 * pass a consistent identity instead of churning a fresh Map each render. */
const EMPTY_DAY_ROUTES: Map<string, RouteResult> = new Map();

/**
 * `fill` renders the map as a height-filling pane (the trip workspace's ambient
 * split) instead of a self-contained section: no own heading, the card grows to
 * its container. The unplotted affordance, when present, caps to a scroll region.
 */
export function MapPanel({
  snapshot,
  fill = false,
  dayRoutes = EMPTY_DAY_ROUTES,
}: {
  snapshot: TripSnapshot;
  fill?: boolean;
  /** Per-day drawn routes (V2.5 — Routing), keyed by ISO date. Optional so the
   * mobile Map tab and tests can mount the panel without route lines. */
  dayRoutes?: Map<string, RouteResult>;
}) {
  const { activities } = snapshot;
  // Per-day stop numbers (1..N, reset each day) keyed by activity id — the same
  // numbers the itinerary rail stamps (§C.6). Computed over the FULL set so
  // unplotted/hidden-day stops still consume their rail number; the pins only
  // carry numbers for the ones actually drawn (a faithful subset). Bookings are
  // never numbered (see `toMapPins`).
  const stopNumbers = useMemo(() => stopNumbersByDay(activities), [activities]);
  // Render pins, expanded from activities: an ordinary item → one pin; a flight →
  // a departure pin (on `date`) + an arrival pin (on `endDate`) (V2.4 bookings).
  const pins = useMemo(() => toMapPins(activities, stopNumbers), [activities, stopNumbers]);
  const unplotted = useMemo(() => unplottedWithPlace(activities), [activities]);
  // Idea lists in display order (sorted by fractional `position`, the same
  // inline comparator the sync hooks use) — they label the per-list layer
  // toggles for undated pins in the layers control.
  const ideaLists = useMemo(
    () =>
      [...snapshot.ideaLists].sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
      ),
    [snapshot.ideaLists],
  );
  // THE canonical day-color order: the full trip-day sequence from `deriveDays`
  // — the same call (and therefore the same ordinals) the itinerary board and
  // the index rail render from. Keyed off ALL trip days, not just the days that
  // own pins: if a middle day has no pins, a pins-only ordering would shift
  // every later day's ordinal and the map would disagree with the rail's stamp
  // colors. Route lines and pin fills both paint from this one list.
  const orderedDates = useMemo(
    () => deriveDays(snapshot.trip.startDate, snapshot.trip.endDate, activities),
    [snapshot.trip.startDate, snapshot.trip.endDate, activities],
  );

  if (activities.length === 0) {
    if (!fill) return null;
    return (
      <div className="cv-card flex h-full flex-col p-8">
        <EmptyState
          className="flex-1"
          icon={MapPinOff}
          title="The map appears here"
          description="Add a place to an activity and it'll drop a pin."
        />
      </div>
    );
  }

  if (pins.length === 0) {
    const empty = (
      <div className={cn("cv-card flex flex-col p-8", fill && "h-full")}>
        <EmptyState
          className={cn(fill && "flex-1")}
          icon={MapPinOff}
          title="Nothing pinned yet"
          description="Add a location to an activity and pick a search result — it'll drop a pin here."
          // The non-fill variant renders this under MapHeading's <h2>; demote to
          // h3 so they don't become sibling h2s in the section outline.
          headingLevel={3}
        />
      </div>
    );
    if (fill) return empty;
    return (
      <section className="flex flex-col gap-3">
        <MapHeading count={pins.length} />
        {empty}
      </section>
    );
  }

  if (fill)
    return (
      <MapView
        pins={pins}
        unplotted={unplotted}
        dayRoutes={dayRoutes}
        ideaLists={ideaLists}
        orderedDates={orderedDates}
        fill
      />
    );

  return (
    <section className="flex flex-col gap-3">
      <MapHeading count={pins.length} />
      <MapView
        pins={pins}
        unplotted={unplotted}
        dayRoutes={dayRoutes}
        ideaLists={ideaLists}
        orderedDates={orderedDates}
      />
    </section>
  );
}

function MapHeading({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2">
      <MapPin aria-hidden className="size-5 text-[var(--accent-strong)]" />
      <h2 className="font-display font-bold text-xl">Map</h2>
      {count > 0 && (
        <span className="font-medium text-muted-foreground text-sm">
          {count} {count === 1 ? "place" : "places"}
        </span>
      )}
    </div>
  );
}

function MapView({
  pins,
  unplotted,
  dayRoutes = EMPTY_DAY_ROUTES,
  ideaLists,
  orderedDates,
  fill = false,
}: {
  // The FULL render-pin set (a flight is already fanned out into its departure +
  // arrival pins, each carrying its own day/number). See `toMapPins`.
  pins: MapPinFeature[];
  unplotted: Activity[];
  /** Per-day drawn routes (V2.5), keyed by ISO date. */
  dayRoutes?: Map<string, RouteResult>;
  /** Idea lists in display order — the per-list layer toggles + list-color
   * ordinals for undated pins. */
  ideaLists: IdeaList[];
  /** The CANONICAL day-color order (full `deriveDays` trip-day sequence) —
   * shared with the itinerary rail so a day's ordinal, and therefore its hue,
   * is identical on both surfaces. Drives route-line AND pin-fill paint. */
  orderedDates: string[];
  fill?: boolean;
}) {
  const mapConfig = useMapConfig();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [ready, setReady] = useState(false);
  // Per-day / per-idea-list pin filters (Trip Workspace v2). We track HIDDEN
  // keys (default empty = everything visible) so a newly-added day or list
  // shows up automatically. Dated pins key on their ISO date; undated pins key
  // on their idea list (UNLISTED_LIST_KEY for the listless).
  const [hiddenDays, setHiddenDays] = useState<Set<string>>(() => new Set());
  const [hiddenLists, setHiddenLists] = useState<Set<string>>(() => new Set());
  const { selectedId, select } = useMapSelection();
  // Shared with the itinerary (PlanView): the rail-highlighted day. Null on the
  // mobile Map tab (no provider) → the day-follow effect is inert there.
  const { focusedDay } = useFocusedDay();

  // Ordered groups for the layers control: unique dated days ascending, and the
  // idea lists (display order, then "Unlisted") that own undated pins. Undated
  // pins never enter dayGroups — they're toggled per LIST instead.
  const dayGroups = useMemo(() => buildDayGroups(pins, formatDayShort), [pins]);
  const listGroups = useMemo(() => buildListGroups(pins, ideaLists), [pins, ideaLists]);

  const visiblePins = useMemo(
    () =>
      pins.filter((p) =>
        p.date !== null ? !hiddenDays.has(p.date) : !hiddenLists.has(p.listId ?? UNLISTED_LIST_KEY),
      ),
    [pins, hiddenDays, hiddenLists],
  );

  // CLUSTERING CORRECTNESS: the source has `cluster: true`, and clusters are
  // computed over the WHOLE source *before* any MapLibre layer `filter` runs. So
  // the per-day filter operates at the GeoJSON DATA level — we build the
  // FeatureCollection from the *visible* pins and let the src.setData(fc) sync
  // effect below push it. We deliberately do NOT use a layer filter/setFilter on
  // the "pins" layer: that would leave cluster counts wrong and let hidden pins
  // reappear when a cluster is expanded. Data-level filtering makes clusters
  // recompute correctly. (`pins`/`pinsRef` stay the FULL set — boot-fit and
  // focused-day framing consider all pins; framing ≠ visibility.) Each pin already
  // carries its own day + stop number (a flight's arrival pin keys on `endDate`
  // and bookings carry none), so day-filtering and numbering are read off the pin.
  const fc = useMemo(() => toFeatureCollection(visiblePins), [visiblePins]);

  // List ordinals for the list-color `match` arm of the pin fill — the
  // position-sorted display order (the same order IdeasPanel and the index rail
  // render), so a list's ordinal, and therefore its hue, matches its section dot.
  const orderedListIds = useMemo(() => ideaLists.map((l) => l.id), [ideaLists]);
  // Canonical color lookups for the layers-control swatches. A group row's
  // swatch must come from the key's position in the CANONICAL order (the full
  // trip-day / list sequence driving the paint expressions), never the group's
  // own index — the Days group lists only days WITH pins, so its row index can
  // drift from the day's true ordinal. A day-key miss (e.g. a flight arrival on
  // an out-of-range endDate) renders IDEA_PIN_COLOR, matching the pin's actual
  // fallback fill.
  const dayColorByDate = useMemo(
    () => new Map(orderedDates.map((iso, i) => [iso, dayColorForIndex(i)] as const)),
    [orderedDates],
  );
  const listColorById = useMemo(
    () => new Map(orderedListIds.map((id, i) => [id, listColorForIndex(i)] as const)),
    [orderedListIds],
  );
  const dayGroupRows = useMemo(
    () => dayGroups.map((g) => ({ ...g, color: dayColorByDate.get(g.key) ?? IDEA_PIN_COLOR })),
    [dayGroups, dayColorByDate],
  );
  const listGroupRows = useMemo(
    () => listGroups.map((g) => ({ ...g, color: listColorById.get(g.key) ?? IDEA_PIN_COLOR })),
    [listGroups, listColorById],
  );
  // Honor the SAME per-day toggle as the pins: a hidden day drops its line at the
  // data level (the toggle stores the day's ISO key, which is the route's date).
  const routeFc = useMemo(
    () => buildRouteFeatureCollection(dayRoutes, hiddenDays),
    [dayRoutes, hiddenDays],
  );

  const toggleIn = (setHidden: Dispatch<SetStateAction<Set<string>>>, key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleDay = (key: string) => toggleIn(setHiddenDays, key);
  const toggleList = (key: string) => toggleIn(setHiddenLists, key);

  // Latest data, read inside the (one-time) boot effect without re-running it —
  // the live sync effects below keep the source + selection current.
  const fcRef = useRef(fc);
  fcRef.current = fc;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const selectRef = useRef(select);
  selectRef.current = select;
  // Latest route data, read inside the one-time boot effect to seed the source +
  // paint; the live sync effects below keep them current after.
  const routeFcRef = useRef(routeFc);
  routeFcRef.current = routeFc;
  const orderedDatesRef = useRef(orderedDates);
  orderedDatesRef.current = orderedDates;
  const orderedListIdsRef = useRef(orderedListIds);
  orderedListIdsRef.current = orderedListIds;

  // Boot the map once we have a style URL. Deliberately NOT keyed on activities:
  // rebuilding the map on every edit would be wasteful and jarring.
  const styleUrl = mapConfig.data?.styleUrl;
  useEffect(() => {
    if (!styleUrl || !containerRef.current || mapRef.current) return;
    const first = pinsRef.current[0];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      attributionControl: false, // we render attribution ourselves (C.5)
      center: [first?.lng ?? 0, first?.lat ?? 0],
      zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: fcRef.current,
        cluster: true,
        // Clustering is intentionally minimal: proximity alone should NOT group
        // pins — a day's numbered stops must stay individual so the sequence/
        // route reads. Clustering only kicks in at a true zoomed-OUT trip
        // overview (zoom <= 9, i.e. country/multi-region), and even there only
        // when markers sit essentially on the same spot. So at city, district,
        // and day zooms every pin is rendered individually no matter how close,
        // and the only thing clustering saves is the "whole trip at once" view
        // where dozens of pins would otherwise stack into an unreadable blob.
        clusterRadius: 12,
        clusterMaxZoom: 9,
      });
      // Day route lines (V2.5). Added BEFORE the clusters/pins layers so the
      // ribbons render UNDER the numbered pins. One `LineString` per visible day,
      // tinted by `dayColorExpression` (a `match` on the feature's `date`).
      map.addSource(ROUTES_SOURCE_ID, { type: "geojson", data: routeFcRef.current });
      map.addLayer({
        id: ROUTE_LINE_LAYER_ID,
        type: "line",
        source: ROUTES_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": dayColorExpression(orderedDatesRef.current),
          "line-width": 2.5,
          "line-opacity": 0.75,
        },
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#7c6b58",
          "circle-radius": ["step", ["get", "point_count"], 16, 5, 22, 15, 28],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fffbf1",
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13 },
        paint: { "text-color": "#fffbf1" },
      });
      map.addLayer({
        id: "pins",
        type: "circle",
        source: SOURCE_ID,
        paint: {
          // FILL = the composed day/list color: dated pins match on `date` (the
          // same hue ramp AND the same canonical day order the route lines and
          // the rail stamps use, so pin ↔ ribbon ↔ stamp read as one system);
          // undated (Ideas-pool) pins fall through to a nested match on
          // `listId` → their idea list's cool-ramp color, with Unlisted landing
          // on the neutral IDEA_PIN_COLOR. Repainted by the orderedDates/
          // orderedListIds effect below when ordinals shift.
          "circle-color": pinFillExpression(orderedDatesRef.current, orderedListIdsRef.current),
          // A touch larger than the v1 radius (8) so the stop number reads on the
          // marker; still comfortably below the cluster min radius (16) so the
          // pin/cluster hierarchy holds.
          "circle-radius": 11,
          // RING = the activity's category tint via the JS token bridge (paint
          // can't read CSS vars): a `match` on `category` → the resolved
          // `--cat-*` color (demoted from fill by the pins-by-day pass). A hair
          // wider than the old white stroke (2.5) so the category signal stays
          // readable in its new supporting role. The theme-reactivity effect
          // below re-reads + re-applies it on theme change. See pin-tint.ts.
          "circle-stroke-width": 3,
          "circle-stroke-color": pinColorExpression(readPinTints()),
        },
        filter: ["!", ["has", "point_count"]],
      });
      // The per-day stop number, rendered ON each pin so the map and the rail are
      // cross-referenceable (pin ② ↔ rail stop ②, §C.6). A `symbol` layer over
      // the circle `pins` — the same source/feature, filtered to individual
      // (non-cluster) pins that carry a `number`. Layout/paint live in
      // geo-features.ts as exported constants (PIN_NUMBER_LAYOUT / _PAINT) so a
      // unit test can guard the collision tuning: native collision is ON, so
      // when two pins truly overlap the lower-numbered label wins and the
      // loser's number culls cleanly (its circle stays visible/clickable)
      // instead of both merging into unreadable glyph soup.
      map.addLayer({
        id: "pin-numbers",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["all", ["!", ["has", "point_count"]], ["has", "number"]],
        layout: PIN_NUMBER_LAYOUT,
        paint: PIN_NUMBER_PAINT,
      });

      // Pin click → select + popup (bidirectional highlight, half 1). Bind both
      // the circle and the number-symbol layer so a click anywhere on the pin —
      // including dead-center on the glyph — still selects (the symbol sits atop
      // the circle). `select` is idempotent, so a click hitting both is harmless.
      const onPinClick = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties?.id as string | undefined;
        if (id) selectRef.current(id);
      };
      map.on("click", "pins", onPinClick);
      map.on("click", "pin-numbers", onPinClick);
      // Cluster click → zoom in.
      map.on("click", "clusters", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const clusterId = f?.properties?.cluster_id;
        const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (clusterId == null || !src || !f) return;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geom = f.geometry as Point;
          map.easeTo({ center: geom.coordinates as [number, number], zoom });
        });
      });
      for (const layer of ["pins", "pin-numbers", "clusters"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setReady(true);
      fitToPlotted(map, pinsRef.current);
    });

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [styleUrl]);

  // Keep the source data in sync as activities change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    src?.setData(fc);
  }, [fc, ready]);

  // Push the route geometry as it resolves (and as day toggles hide/show lines).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(ROUTES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    src?.setData(routeFc);
  }, [routeFc, ready]);

  // Re-apply the color matches when the canonical orders change (a day or list
  // added/removed shifts ordinals → hues) — the route lines and the pin fills
  // key on the same day ordinals, so they repaint together and never drift
  // apart (from each other, or from the rail's stamps/dots).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer(ROUTE_LINE_LAYER_ID)) {
      map.setPaintProperty(ROUTE_LINE_LAYER_ID, "line-color", dayColorExpression(orderedDates));
    }
    if (map.getLayer("pins")) {
      map.setPaintProperty("pins", "circle-color", pinFillExpression(orderedDates, orderedListIds));
    }
  }, [orderedDates, orderedListIds, ready]);

  // Selection → fly to the pin and show a popup (bidirectional highlight, half 2).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    popupRef.current?.remove();
    if (!selectedId) return;
    // A selected activity may own >1 pin (a flight) — fly to its first pin (the
    // departure for a flight); both pins share the same `id`, so either click
    // resolves here and the rail cross-highlight still matches.
    const place = pins.find((p) => p.id === selectedId);
    if (!place) return;
    map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 });
    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 14 })
      .setLngLat([place.lng, place.lat])
      .setText(place.title)
      .addTo(map);
  }, [selectedId, pins, ready]);

  // Map follows the itinerary's focused day (the deferred C.4 polish): when the
  // focused day *changes*, frame that day's pins. Deps are only
  // [focusedDay, ready] — `pins` is read via its ref so adding/editing an
  // activity won't reframe; only an actual day switch does. This fires on day
  // change, while the selection effect above flies to a single pin on select —
  // hovering a card sets focusedDay (usually unchanged → no reframe) and selects
  // a pin, so the pin fly-to wins for that interaction; jumping days reframes.
  // Edge cases: a day with 0 plotted pins does nothing (no jump to a blank/world
  // view), a single pin centers at a sensible zoom (via fitToPlotted). When
  // focusedDay is null (mobile Map tab, no provider) we leave the boot's fit-all
  // intact. (Scope = framing only; all pins stay visible/styled as today. A
  // future pass could de-emphasize off-day pins.) Far-away flight endpoints are
  // excluded from the frame (pinsForDayFocus) — a long-haul departure pin
  // otherwise stretches the bounds to world scale and buries the day.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusedDay) return;
    const ofDay = pinsForDayFocus(pinsRef.current.filter((p) => p.date === focusedDay));
    if (ofDay.length === 0) return;
    fitToPlotted(map, ofDay, 600);
  }, [focusedDay, ready]);

  // Re-tint the pins' category RING when the active color theme changes. The
  // two-axis theming (TD-11) lives on `<html>`'s `data-theme` (color) attribute;
  // MapLibre paint can't read CSS vars, so the rest of the UI re-themes
  // automatically but the map can't — we mirror that here by re-reading the
  // resolved `--cat-*` tokens and pushing a fresh `match` onto the pins layer's
  // stroke (the FILL is day-colored from a literal palette, so it's theme-inert;
  // the ring is the only theme-reactive part). `data-style` is the STRUCTURE
  // axis (no hue change), so we watch `data-theme` only. The initial tint is set
  // at addLayer; `retint()` also runs once here to cover a theme flip between
  // boot and `ready`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const root = document.documentElement;
    const retint = () => {
      if (map.getLayer("pins")) {
        map.setPaintProperty("pins", "circle-stroke-color", pinColorExpression(readPinTints(root)));
      }
    };
    retint();
    const observer = new MutationObserver(retint);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div className={cn("cv-card overflow-hidden p-0", fill && "flex h-full flex-col")}>
      <div className={cn("relative w-full", fill ? "min-h-0 flex-1" : "h-[320px] sm:h-[400px]")}>
        <div
          ref={containerRef}
          role="application"
          className="size-full"
          aria-label="Map of trip activities"
        />
        {/* Tiles come from the host-configured provider via /api/geo/map-config;
            if that fetch fails the canvas can't boot, so surface a light notice
            over the blank pane rather than leave a silent grey box. */}
        {mapConfig.isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center">
            <TriangleAlert aria-hidden className="size-6 text-muted-foreground" />
            <p role="alert" className="max-w-xs text-muted-foreground text-sm">
              The map couldn't load. Your places are still saved — refresh to try again.
            </p>
          </div>
        )}
        {/* Layers control (Trip Workspace v2, compact since the V2.8 map pass).
            Lives inside the map's relative container; NavigationControl owns
            top-right, so this sits top-left — a closed-by-default pill that
            expands to the per-day + per-idea-list toggles. Toggling hides/shows
            pins purely by filtering the GeoJSON data feeding the source (see the
            `fc` memo above) — never a layer filter — so clusters recompute
            correctly. Renders nothing when there's nothing to toggle. */}
        <MapLayersControl
          dayGroups={dayGroupRows}
          listGroups={listGroupRows}
          hiddenDays={hiddenDays}
          hiddenLists={hiddenLists}
          onToggleDay={toggleDay}
          onToggleList={toggleList}
          onShowAllDays={() => setHiddenDays(new Set())}
          onShowAllLists={() => setHiddenLists(new Set())}
        />
      </div>
      {mapConfig.data && (
        // Visible attribution (C.5, TD-5 / provider terms).
        <p
          // biome-ignore lint/security/noDangerouslySetInnerHtml: attribution is server-built from a fixed provider table, not user input
          dangerouslySetInnerHTML={{ __html: mapConfig.data.attribution }}
          className={cn(
            "border-border/60 border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground leading-tight [&_a]:underline",
            fill && "shrink-0",
          )}
        />
      )}

      {/* Plotted activities are driven from the itinerary (click a card's title
          to fly to / highlight its pin), so no list duplicates them here — that
          just buys back map height. We still surface the *unplotted* ones (a
          place name that didn't geocode): the only spot that signal lives, and
          PD-1 says unplotted is normal, not an error to hide. */}
      {unplotted.length > 0 && (
        <div
          className={cn(
            "border-border/60 border-t p-3",
            fill && "max-h-[40%] shrink-0 overflow-y-auto",
          )}
        >
          <p className="mb-1.5 flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
            <MapPinOff aria-hidden className="size-3.5" />
            {unplotted.length} not on the map
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {unplotted.map((a) => (
              <li
                key={a.id}
                className="rounded-pill bg-muted px-2.5 py-1 text-muted-foreground text-xs"
                title={`${a.title} — add a searched location to pin it`}
              >
                {a.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Frame a set of pins; for a single pin just center it at a sensible zoom.
 * `duration` defaults to 0 (instant) for the boot fit; the day-follow passes a
 * value to glide between days rather than snap.
 */
function fitToPlotted(map: maplibregl.Map, pins: MapPinFeature[], duration = 0): void {
  if (pins.length === 1) {
    const only = pins[0];
    if (only) map.easeTo({ center: [only.lng, only.lat], zoom: 12, duration });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const p of pins) bounds.extend([p.lng, p.lat]);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration });
}

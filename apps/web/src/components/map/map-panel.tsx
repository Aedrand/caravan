import type { Activity, TripSnapshot } from "@caravan/shared";
import type { Point } from "geojson";
import { MapPin, MapPinOff, TriangleAlert } from "lucide-react";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDayShort } from "@/components/itinerary/format";
import { EmptyState } from "@/components/ui/empty-state";
import { useMapConfig } from "@/lib/geo";
import { cn } from "@/lib/utils";
import "maplibre-gl/dist/maplibre-gl.css";
import { useFocusedDay } from "./focused-day";
import {
  isPlotted,
  type Plotted,
  stopNumbersByDay,
  toFeatureCollection,
  unplottedWithPlace,
} from "./geo-features";
import { pinColorExpression, readPinTints } from "./pin-tint";
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

/**
 * Day key for the per-day filter (Trip Workspace v2). Dated pins key on their
 * ISO `YYYY-MM-DD`; undated pins (an Ideas-pool place with no date) collapse to
 * a sentinel. The leading space can't collide with a real ISO date and sorts
 * ahead of all of them.
 */
const UNDATED = " undated";
const dayKey = (a: Plotted) => a.date ?? UNDATED;

/**
 * `fill` renders the map as a height-filling pane (the trip workspace's ambient
 * split) instead of a self-contained section: no own heading, the card grows to
 * its container. The unplotted affordance, when present, caps to a scroll region.
 */
export function MapPanel({ snapshot, fill = false }: { snapshot: TripSnapshot; fill?: boolean }) {
  const { activities } = snapshot;
  const plotted = useMemo(() => activities.filter(isPlotted), [activities]);
  const unplotted = useMemo(() => unplottedWithPlace(activities), [activities]);

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

  if (plotted.length === 0) {
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
        <MapHeading count={plotted.length} />
        {empty}
      </section>
    );
  }

  if (fill) return <MapView activities={activities} plotted={plotted} unplotted={unplotted} fill />;

  return (
    <section className="flex flex-col gap-3">
      <MapHeading count={plotted.length} />
      <MapView activities={activities} plotted={plotted} unplotted={unplotted} />
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
  activities,
  plotted,
  unplotted,
  fill = false,
}: {
  // The FULL activity set — needed to number pins exactly like the rail does.
  // Per-day numbering counts every dated stop (incl. unplotted/un-placed ones),
  // so `plotted` alone would drift; see `stopNumbersByDay`.
  activities: Activity[];
  plotted: Plotted[];
  unplotted: Activity[];
  fill?: boolean;
}) {
  const mapConfig = useMapConfig();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [ready, setReady] = useState(false);
  // Per-day pin filter (Trip Workspace v2). We track HIDDEN days (default empty
  // = everything visible) so a newly-added day shows up automatically.
  const [hiddenDays, setHiddenDays] = useState<Set<string>>(() => new Set());
  const { selectedId, select } = useMapSelection();
  // Shared with the itinerary (PlanView): the rail-highlighted day. Null on the
  // mobile Map tab (no provider) → the day-follow effect is inert there.
  const { focusedDay } = useFocusedDay();

  // Ordered groups for the filter control: unique dated days ascending, then the
  // undated "Ideas" group last (only if any undated pins exist).
  const dayGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of plotted) {
      const k = dayKey(p);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const groups = [...counts.keys()]
      .filter((k) => k !== UNDATED)
      .sort()
      .map((key) => ({ key, label: formatDayShort(key), count: counts.get(key) ?? 0 }));
    const undated = counts.get(UNDATED);
    if (undated) groups.push({ key: UNDATED, label: "Ideas", count: undated });
    return groups;
  }, [plotted]);

  const visiblePlotted = useMemo(
    () => plotted.filter((p) => !hiddenDays.has(dayKey(p))),
    [plotted, hiddenDays],
  );

  // CLUSTERING CORRECTNESS: the source has `cluster: true`, and clusters are
  // computed over the WHOLE source *before* any MapLibre layer `filter` runs. So
  // the per-day filter operates at the GeoJSON DATA level — we build the
  // FeatureCollection from the *visible* set and let the src.setData(fc) sync
  // effect below push it. We deliberately do NOT use a layer filter/setFilter on
  // the "pins" layer: that would leave cluster counts wrong and let hidden pins
  // reappear when a cluster is expanded. Data-level filtering makes clusters
  // recompute correctly. (`plotted`/`plottedRef` stay the FULL set — boot-fit and
  // focused-day framing consider all pins; framing ≠ visibility.)
  // Per-day stop numbers (1..N, reset each day) keyed by activity id — the same
  // numbers the itinerary rail stamps, so pin ② ↔ rail stop ② (spec §C.6).
  // Computed over the FULL activity set (not `visiblePlotted`) so unplotted/
  // hidden-day stops still consume their rail number; the FeatureCollection only
  // carries numbers for the pins it actually draws, i.e. a faithful subset.
  const stopNumbers = useMemo(() => stopNumbersByDay(activities), [activities]);
  const fc = useMemo(
    () => toFeatureCollection(visiblePlotted, stopNumbers),
    [visiblePlotted, stopNumbers],
  );

  const toggleDay = (key: string) => {
    setHiddenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Latest data, read inside the (one-time) boot effect without re-running it —
  // the live sync effects below keep the source + selection current.
  const fcRef = useRef(fc);
  fcRef.current = fc;
  const plottedRef = useRef(plotted);
  plottedRef.current = plotted;
  const selectRef = useRef(select);
  selectRef.current = select;

  // Boot the map once we have a style URL. Deliberately NOT keyed on activities:
  // rebuilding the map on every edit would be wasteful and jarring.
  const styleUrl = mapConfig.data?.styleUrl;
  useEffect(() => {
    if (!styleUrl || !containerRef.current || mapRef.current) return;
    const first = plottedRef.current[0];

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
        clusterRadius: 48,
        clusterMaxZoom: 14,
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
        filter: ["!", ["has", "point_count"]],
        paint: {
          // Tint each pin by its activity category via the JS token bridge (paint
          // can't read CSS vars): a `match` on the feature's `category` → the
          // resolved `--cat-*` color, falling back to the legacy orange. The
          // theme-reactivity effect below re-reads + re-applies this on theme
          // change so pins track the active color theme. See pin-tint.ts.
          "circle-color": pinColorExpression(readPinTints()),
          // A touch larger than the v1 radius (8) so the stop number reads on the
          // marker; still comfortably below the cluster min radius (16) so the
          // pin/cluster hierarchy holds.
          "circle-radius": 11,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#fffbf1",
        },
      });
      // The per-day stop number, rendered ON each pin so the map and the rail are
      // cross-referenceable (pin ② ↔ rail stop ②, §C.6). A `symbol` layer over
      // the circle `pins` — the same source/feature, filtered to individual
      // (non-cluster) pins that carry a `number`. The circle below it is now
      // category-tinted, so the white number gets a translucent dark halo to stay
      // legible on lighter tints (e.g. the gold lodging pin). Literal palette
      // values — paint can't read CSS vars, and white+dark-halo reads on every
      // tint in both color themes.
      map.addLayer({
        id: "pin-numbers",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["all", ["!", ["has", "point_count"]], ["has", "number"]],
        layout: {
          "text-field": ["to-string", ["get", "number"]],
          "text-size": 12,
          // Every pin's number must stay visible even when pins crowd together —
          // the rail cross-reference breaks if MapLibre's symbol collision culls
          // overlapping labels, so opt out of placement collision entirely.
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#fffbf1",
          "text-halo-color": "rgba(40,30,18,0.55)",
          "text-halo-width": 1.3,
          "text-halo-blur": 0.3,
        },
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
      fitToPlotted(map, plottedRef.current);
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

  // Selection → fly to the pin and show a popup (bidirectional highlight, half 2).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    popupRef.current?.remove();
    if (!selectedId) return;
    const place = plotted.find((a) => a.id === selectedId);
    if (!place) return;
    map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 });
    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 14 })
      .setLngLat([place.lng, place.lat])
      .setText(place.title)
      .addTo(map);
  }, [selectedId, plotted, ready]);

  // Map follows the itinerary's focused day (the deferred C.4 polish): when the
  // focused day *changes*, frame that day's plotted pins. Deps are only
  // [focusedDay, ready] — `plotted` is read via its ref so adding/editing an
  // activity won't reframe; only an actual day switch does. This fires on day
  // change, while the selection effect above flies to a single pin on select —
  // hovering a card sets focusedDay (usually unchanged → no reframe) and selects
  // a pin, so the pin fly-to wins for that interaction; jumping days reframes.
  // Edge cases: a day with 0 plotted pins does nothing (no jump to a blank/world
  // view), a single pin centers at a sensible zoom (via fitToPlotted). When
  // focusedDay is null (mobile Map tab, no provider) we leave the boot's fit-all
  // intact. (Scope = framing only; all pins stay visible/styled as today. A
  // future pass could de-emphasize off-day pins.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusedDay) return;
    const ofDay = plottedRef.current.filter((a) => a.date === focusedDay);
    if (ofDay.length === 0) return;
    fitToPlotted(map, ofDay, 600);
  }, [focusedDay, ready]);

  // Re-tint pins when the active color theme changes. The two-axis theming
  // (TD-11) lives on `<html>`'s `data-theme` (color) attribute; MapLibre paint
  // can't read CSS vars, so the rest of the UI re-themes automatically but the
  // map can't — we mirror that here by re-reading the resolved `--cat-*` tokens
  // and pushing a fresh `match` onto the pins layer. `data-style` is the
  // STRUCTURE axis (no hue change), so we watch `data-theme` only. The initial
  // tint is set at addLayer; `retint()` also runs once here to cover a theme flip
  // between boot and `ready`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const root = document.documentElement;
    const retint = () => {
      if (map.getLayer("pins")) {
        map.setPaintProperty("pins", "circle-color", pinColorExpression(readPinTints(root)));
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
        {/* Per-day filter overlay (Trip Workspace v2). Lives inside the map's
            relative container; NavigationControl owns top-right, so this sits
            top-left. Toggling a day hides/shows its pins purely by filtering the
            GeoJSON data feeding the source (see the `fc` memo above) — never a
            layer filter — so clusters recompute correctly. Only shown once pins
            span ≥2 day groups. */}
        {dayGroups.length >= 2 && (
          <div
            role="toolbar"
            aria-label="Filter pins by day"
            className="cv-card absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] max-w-[min(60%,15rem)] flex-col gap-1.5 overflow-y-auto p-2"
          >
            <p className="px-0.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Days
            </p>
            <div className="flex flex-wrap gap-1">
              {dayGroups.map(({ key, label, count }) => {
                const visible = !hiddenDays.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
                    aria-pressed={visible}
                    className={cn(
                      "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-control border-2 px-2 py-0.5 font-body font-semibold text-xs transition-colors",
                      visible
                        ? "border-border bg-card text-foreground shadow-control"
                        : "border-transparent text-muted-foreground opacity-55 hover:text-foreground",
                    )}
                  >
                    {label}
                    <span className="text-[10px] tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            {hiddenDays.size > 0 && (
              <button
                type="button"
                onClick={() => setHiddenDays(new Set())}
                className="self-start rounded-control px-1.5 py-0.5 font-semibold text-[11px] text-muted-foreground hover:text-foreground"
              >
                All
              </button>
            )}
          </div>
        )}
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
function fitToPlotted(map: maplibregl.Map, plotted: Plotted[], duration = 0): void {
  if (plotted.length === 1) {
    const only = plotted[0];
    if (only) map.easeTo({ center: [only.lng, only.lat], zoom: 12, duration });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const p of plotted) bounds.extend([p.lng, p.lat]);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration });
}

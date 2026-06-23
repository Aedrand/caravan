import type { Activity, TripSnapshot } from "@caravan/shared";
import type { Point } from "geojson";
import { MapPin, MapPinOff } from "lucide-react";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMapConfig } from "@/lib/geo";
import { cn } from "@/lib/utils";
import "maplibre-gl/dist/maplibre-gl.css";
import { useFocusedDay } from "./focused-day";
import { isPlotted, type Plotted, toFeatureCollection, unplottedWithPlace } from "./geo-features";
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
      <div className="cv-card flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <MapPinOff aria-hidden className="size-6 text-muted-foreground" />
        <p className="font-display font-bold">The map appears here</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Add a place to an activity and it'll drop a pin.
        </p>
      </div>
    );
  }

  if (plotted.length === 0) {
    const empty = (
      <div
        className={cn(
          "cv-card flex flex-col items-center gap-2 p-8 text-center",
          fill && "h-full justify-center",
        )}
      >
        <MapPinOff aria-hidden className="size-6 text-muted-foreground" />
        <p className="font-display font-bold">Nothing pinned yet</p>
        <p className="max-w-sm text-muted-foreground text-sm">
          Add a location to an activity and pick a search result — it'll drop a pin here.
        </p>
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

  if (fill) return <MapView plotted={plotted} unplotted={unplotted} fill />;

  return (
    <section className="flex flex-col gap-3">
      <MapHeading count={plotted.length} />
      <MapView plotted={plotted} unplotted={unplotted} />
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
  plotted,
  unplotted,
  fill = false,
}: {
  plotted: Plotted[];
  unplotted: Activity[];
  fill?: boolean;
}) {
  const mapConfig = useMapConfig();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [ready, setReady] = useState(false);
  const { selectedId, select } = useMapSelection();
  // Shared with the itinerary (PlanView): the rail-highlighted day. Null on the
  // mobile Map tab (no provider) → the day-follow effect is inert there.
  const { focusedDay } = useFocusedDay();

  const fc = useMemo(() => toFeatureCollection(plotted), [plotted]);

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
          "circle-color": "#c05621",
          "circle-radius": 8,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#fffbf1",
        },
      });

      // Pin click → select + popup (bidirectional highlight, half 1).
      map.on("click", "pins", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties?.id as string | undefined;
        if (id) selectRef.current(id);
      });
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
      for (const layer of ["pins", "clusters"]) {
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

  return (
    <div className={cn("cv-card overflow-hidden p-0", fill && "flex h-full flex-col")}>
      <div
        ref={containerRef}
        role="application"
        className={cn("w-full", fill ? "min-h-0 flex-1" : "h-[320px] sm:h-[400px]")}
        aria-label="Map of trip activities"
      />
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

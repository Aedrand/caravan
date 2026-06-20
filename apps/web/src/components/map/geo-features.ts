import type { Activity } from "@caravan/shared";
import type { FeatureCollection } from "geojson";

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

/** GeoJSON for the clustered pin source. Properties carry id + title for popups. */
export function toFeatureCollection(plotted: Plotted[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: plotted.map((a) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: { id: a.id, title: a.title },
    })),
  };
}

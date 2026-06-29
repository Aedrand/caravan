import { z } from "zod";

/**
 * Routing contract (V2.5 — Routing). The routing proxy draws the road/footpath
 * line between a day's ordered stops; this is the single wire shape both sides
 * share. Mode is a USER-facing intent (`walking` | `driving`) — the
 * provider-specific costing name (Valhalla `pedestrian`/`auto`, ORS
 * `foot-walking`/`driving-car`) is an internal translation that lives only in
 * the server proxy, never on the wire.
 */
export const ROUTE_MODES = ["walking", "driving"] as const;
export const RouteModeSchema = z.enum(ROUTE_MODES);
export type RouteMode = z.infer<typeof RouteModeSchema>;

/** A single waypoint — a stop's resolved coordinate. */
export const CoordSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});
export type Coord = z.infer<typeof CoordSchema>;

/**
 * `POST /api/route` request. At least two waypoints (origin + destination); the
 * proxy stitches them into one multi-leg route in the chosen mode.
 */
export const RouteRequestSchema = z.object({
  waypoints: z.array(CoordSchema).min(2),
  mode: RouteModeSchema,
});
export type RouteRequest = z.infer<typeof RouteRequestSchema>;

/** One leg of the route — the segment between two consecutive waypoints. */
export const RouteLegSchema = z.object({
  durationSeconds: z.number(),
  distanceMeters: z.number(),
});
export type RouteLeg = z.infer<typeof RouteLegSchema>;

/**
 * A resolved route. `geometry` is GeoJSON coordinate order — `[lng, lat]`
 * pairs — so it drops straight into a MapLibre `LineString` source without a
 * swap. `legs` mirrors the waypoint pairs in order; the top-level
 * `durationSeconds`/`distanceMeters` are the whole-route totals.
 */
export const RouteResultSchema = z.object({
  /** Ordered `[lng, lat]` pairs (GeoJSON order). */
  geometry: z.array(z.tuple([z.number(), z.number()])),
  legs: z.array(RouteLegSchema),
  durationSeconds: z.number(),
  distanceMeters: z.number(),
});
export type RouteResult = z.infer<typeof RouteResultSchema>;

/**
 * `POST /api/route` response. `route` is null on a graceful-off (upstream
 * unreachable or unparseable) — still HTTP 200, so the client renders pins
 * without a connecting line rather than surfacing an error.
 */
export const RouteResponseSchema = z.object({
  route: RouteResultSchema.nullable(),
});
export type RouteResponse = z.infer<typeof RouteResponseSchema>;

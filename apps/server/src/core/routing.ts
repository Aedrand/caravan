import { createHash } from "node:crypto";
import type { Coord, RouteMode, RouteResult } from "@caravan/shared";
import { eq, lte } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import { schema } from "../db";
import type { Logger } from "../logger";
import { createRateLimiter } from "./geo";

/**
 * Routing proxy core (V2.5). Mirrors the geo proxy (core/geo.ts) almost
 * exactly: every route request flows through here so provider keys never reach
 * the browser, responses cache in SQLite, providers are swappable by env, and
 * one per-deployment rate limiter protects the (often donated) upstream. The
 * USER-facing mode (`walking`/`driving`) is translated to each provider's
 * costing/profile name HERE — that translation never leaks onto the wire.
 */

type RoutingConfig = Config["routing"];

const ROUTE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — road geometry between two points is stable enough.
const FETCH_TIMEOUT_MS = 10_000;
/** Routing upstreams (OSRM/Valhalla/ORS) ask for a descriptive UA + contact. */
const USER_AGENT = "Caravan/1.0 (self-hosted; https://github.com/Aedrand/caravan)";

export class RoutingError extends Error {
  constructor(
    readonly status: 400 | 429 | 502,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

// Re-export so route/job wiring can build a limiter without importing geo too.
export { createRateLimiter };

// --- Polyline decoding --------------------------------------------------------

/**
 * Decode a Google-encoded polyline into `[lng, lat]` (GeoJSON order) pairs.
 * `factor` is the coordinate precision: 1e6 for Valhalla (precision 6), 1e5 for
 * the classic precision-5 encoding (OpenRouteService). The encoded stream is
 * `(lat, lng)` deltas; we swap to `[lng, lat]` on the way out so the result
 * drops straight into a MapLibre LineString.
 */
function decodePolyline(str: string, factor: number): [number, number][] {
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = str.length;

  while (index < len) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    out.push([lng / factor, lat / factor]);
  }
  return out;
}

/** Valhalla `shape` (precision 6) → `[lng, lat]` pairs. */
export function decodePolyline6(s: string): [number, number][] {
  return decodePolyline(s, 1e6);
}

/** Classic precision-5 polyline (OpenRouteService) → `[lng, lat]` pairs. */
export function decodePolyline5(s: string): [number, number][] {
  return decodePolyline(s, 1e5);
}

// --- Cache keying -------------------------------------------------------------

/**
 * Truncate to 5 dp. The epsilon nudge (in scaled units) absorbs binary-FP
 * noise so a clean value like `139.7454` (whose `*1e5` is `13974539.999…`)
 * lands on `139.7454`, not `139.74539` — otherwise near-identical requests
 * would split across cache keys.
 */
function truncate5(n: number): number {
  return Math.trunc(n * 1e5 + Math.sign(n) * 1e-6) / 1e5;
}

/** Truncate a coordinate list to 5 dp so near-identical requests share a key. */
export function normalizeCoords(coords: Coord[]): { lat: number; lng: number }[] {
  return coords.map((c) => ({ lat: truncate5(c.lat), lng: truncate5(c.lng) }));
}

/** `<provider>:<mode>:<sha256hex>` — the hash covers the normalized waypoints. */
export function buildCacheKey(provider: string, mode: RouteMode, coords: Coord[]): string {
  const canonical = JSON.stringify(normalizeCoords(coords));
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `${provider}:${mode}:${hash}`;
}

function readRouteCache(db: Db, key: string, now: number): RouteResult | undefined {
  const row = db.select().from(schema.routeCache).where(eq(schema.routeCache.key, key)).get();
  if (!row) return undefined;
  if (row.expiresAt <= now) return undefined; // stale = miss
  try {
    return JSON.parse(row.value) as RouteResult;
  } catch {
    return undefined;
  }
}

function writeRouteCache(db: Db, key: string, value: RouteResult, now: number): void {
  const serialized = JSON.stringify(value);
  db.insert(schema.routeCache)
    .values({ key, value: serialized, createdAt: now, expiresAt: now + ROUTE_TTL_MS })
    .onConflictDoUpdate({
      target: schema.routeCache.key,
      set: { value: serialized, createdAt: now, expiresAt: now + ROUTE_TTL_MS },
    })
    .run();
}

/** Reclaim expired cache rows (registered as a periodic job). */
export function pruneRouteCache(db: Db, now: number = Date.now()): void {
  db.delete(schema.routeCache).where(lte(schema.routeCache.expiresAt, now)).run();
}

// --- Provider selection + costing translation --------------------------------

export type EffectiveRoutingProvider = "osrm" | "valhalla" | "openrouteservice";

/**
 * Resolve the provider that will actually be hit. ORS is honoured only when
 * explicitly selected AND a key is present; Valhalla when explicitly selected;
 * everything else (the default, plus keyless-ORS misconfig) falls back to the
 * keyless OSRM default so a clean `git clone` still draws routes.
 */
export function effectiveProvider(cfg: RoutingConfig): EffectiveRoutingProvider {
  if (cfg.provider === "openrouteservice" && cfg.orsKey) return "openrouteservice";
  if (cfg.provider === "valhalla") return "valhalla";
  return "osrm";
}

/** Mode → Valhalla costing. The translation lives here, never on the wire. */
function valhallaCosting(mode: RouteMode): "pedestrian" | "auto" {
  return mode === "walking" ? "pedestrian" : "auto";
}

/** Mode → OpenRouteService profile. */
function orsProfile(mode: RouteMode): "foot-walking" | "driving-car" {
  return mode === "walking" ? "foot-walking" : "driving-car";
}

/**
 * Mode → FOSSGIS OSRM path segments. FOSSGIS runs one OSRM engine per profile
 * behind per-profile path prefixes on a single host (`/routed-foot`,
 * `/routed-car`); `profile` is the OSRM service profile name in the route path.
 * We only support walking/driving (no cycling). Lives here, never on the wire.
 */
function osrmProfile(mode: RouteMode): { prefix: string; profile: string } {
  return mode === "walking"
    ? { prefix: "routed-foot", profile: "foot" }
    : { prefix: "routed-car", profile: "driving" };
}

// --- Provider response parsers ------------------------------------------------

function finiteNum(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Append `pts`, dropping a leading point that duplicates the running tail. */
function appendDeduped(acc: [number, number][], pts: [number, number][]): void {
  let start = 0;
  const tail = acc[acc.length - 1];
  if (tail && pts[0] && tail[0] === pts[0][0] && tail[1] === pts[0][1]) start = 1;
  for (let i = start; i < pts.length; i++) acc.push(pts[i] as [number, number]);
}

/**
 * Valhalla `/route` response → RouteResult. `directions_options.units` is
 * `kilometers`, so leg/summary `length` is km → ×1000 for meters; `time` is
 * already seconds. Each leg's `shape` is a precision-6 polyline; legs are
 * concatenated (shared boundary points deduped).
 */
export function parseValhalla(json: unknown): RouteResult {
  const trip = (json as { trip?: unknown })?.trip as
    | { status?: unknown; legs?: unknown; summary?: { time?: unknown; length?: unknown } }
    | undefined;
  if (!trip || finiteNum(trip.status) !== 0 || !Array.isArray(trip.legs)) {
    throw new RoutingError(502, "route_unparseable", "valhalla response missing a routed trip");
  }

  const geometry: [number, number][] = [];
  const legs: RouteResult["legs"] = [];
  for (const raw of trip.legs) {
    const leg = raw as { summary?: { time?: unknown; length?: unknown }; shape?: unknown };
    const durationSeconds = finiteNum(leg.summary?.time) ?? 0;
    const lengthKm = finiteNum(leg.summary?.length) ?? 0;
    legs.push({ durationSeconds, distanceMeters: lengthKm * 1000 });
    if (typeof leg.shape === "string") appendDeduped(geometry, decodePolyline6(leg.shape));
  }

  const durationSeconds =
    finiteNum(trip.summary?.time) ?? legs.reduce((a, l) => a + l.durationSeconds, 0);
  const lengthKm = finiteNum(trip.summary?.length);
  const distanceMeters =
    lengthKm !== undefined ? lengthKm * 1000 : legs.reduce((a, l) => a + l.distanceMeters, 0);

  return { geometry, legs, durationSeconds, distanceMeters };
}

/**
 * OpenRouteService `/v2/directions/{profile}/json` response → RouteResult.
 * `geometry` is a precision-5 polyline; `summary`/`segments` distances are
 * already meters, durations seconds. One segment per waypoint pair → one leg.
 */
export function parseORS(json: unknown): RouteResult {
  const routes = (json as { routes?: unknown })?.routes;
  const route = Array.isArray(routes)
    ? (routes[0] as Record<string, unknown> | undefined)
    : undefined;
  if (!route) {
    throw new RoutingError(502, "route_unparseable", "openrouteservice response had no routes");
  }
  const geometry = typeof route.geometry === "string" ? decodePolyline5(route.geometry) : [];
  const segments = Array.isArray(route.segments) ? route.segments : [];
  const legs: RouteResult["legs"] = segments.map((raw) => {
    const seg = raw as { duration?: unknown; distance?: unknown };
    return {
      durationSeconds: finiteNum(seg.duration) ?? 0,
      distanceMeters: finiteNum(seg.distance) ?? 0,
    };
  });
  const summary = (route.summary ?? {}) as { duration?: unknown; distance?: unknown };
  const durationSeconds =
    finiteNum(summary.duration) ?? legs.reduce((a, l) => a + l.durationSeconds, 0);
  const distanceMeters =
    finiteNum(summary.distance) ?? legs.reduce((a, l) => a + l.distanceMeters, 0);
  return { geometry, legs, durationSeconds, distanceMeters };
}

/**
 * OSRM `/route/v1/{profile}` response → RouteResult. Because we request
 * `geometries=geojson`, the geometry is already `[lng, lat]` GeoJSON — NO
 * polyline decode (unlike Valhalla/ORS). Leg/route `distance` is meters and
 * `duration` seconds already. A `code !== "Ok"`, a missing/empty `routes`, or
 * (upstream) a non-200 throws RoutingError so the route handler can graceful-off.
 */
export function parseOSRM(json: unknown): RouteResult {
  const obj = json as { code?: unknown; routes?: unknown } | undefined;
  const routes = Array.isArray(obj?.routes) ? obj.routes : undefined;
  const route = routes?.[0] as Record<string, unknown> | undefined;
  if (obj?.code !== "Ok" || !route) {
    throw new RoutingError(502, "route_unparseable", "osrm response had no routed path");
  }
  const coordinates = (route.geometry as { coordinates?: unknown } | undefined)?.coordinates;
  const geometry: [number, number][] = Array.isArray(coordinates)
    ? coordinates.map((c) => {
        const pair = c as [unknown, unknown];
        return [finiteNum(pair?.[0]) ?? 0, finiteNum(pair?.[1]) ?? 0] as [number, number];
      })
    : [];
  const rawLegs = Array.isArray(route.legs) ? route.legs : [];
  const legs: RouteResult["legs"] = rawLegs.map((raw) => {
    const leg = raw as { duration?: unknown; distance?: unknown };
    return {
      durationSeconds: finiteNum(leg.duration) ?? 0,
      distanceMeters: finiteNum(leg.distance) ?? 0,
    };
  });
  const durationSeconds =
    finiteNum(route.duration) ?? legs.reduce((a, l) => a + l.durationSeconds, 0);
  const distanceMeters =
    finiteNum(route.distance) ?? legs.reduce((a, l) => a + l.distanceMeters, 0);
  return { geometry, legs, durationSeconds, distanceMeters };
}

// --- Upstream fetch -----------------------------------------------------------

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new RoutingError(502, "route_upstream_unreachable", `router unreachable: ${String(err)}`);
  }
  if (!res.ok) {
    throw new RoutingError(502, "route_upstream_error", `router returned ${res.status}`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new RoutingError(502, "route_unparseable", `router returned non-JSON: ${String(err)}`);
  }
}

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new RoutingError(502, "route_upstream_unreachable", `router unreachable: ${String(err)}`);
  }
  if (!res.ok) {
    throw new RoutingError(502, "route_upstream_error", `router returned ${res.status}`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new RoutingError(502, "route_unparseable", `router returned non-JSON: ${String(err)}`);
  }
}

function valhallaUrl(cfg: RoutingConfig): string {
  return new URL("/route", cfg.url).toString();
}

function orsUrl(cfg: RoutingConfig, mode: RouteMode): string {
  return new URL(`/v2/directions/${orsProfile(mode)}/json`, cfg.url).toString();
}

/**
 * OSRM GET URL: per-profile path prefix + service profile + `;`-joined
 * `lng,lat` waypoints (OSRM is lng,lat — same as our geometry order). We ask
 * for the full GeoJSON geometry plus per-leg distance/duration annotations.
 */
function osrmUrl(cfg: RoutingConfig, waypoints: Coord[], mode: RouteMode): string {
  const { prefix, profile } = osrmProfile(mode);
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = new URL(`/${prefix}/route/v1/${profile}/${coords}`, cfg.url);
  url.search = "overview=full&geometries=geojson&annotations=distance,duration";
  return url.toString();
}

async function fetchValhalla(
  cfg: RoutingConfig,
  waypoints: Coord[],
  mode: RouteMode,
): Promise<RouteResult> {
  const body = {
    locations: waypoints.map((w) => ({ lat: w.lat, lon: w.lng })),
    costing: valhallaCosting(mode),
    directions_options: { units: "kilometers" },
  };
  return parseValhalla(await postJson(valhallaUrl(cfg), body, {}));
}

async function fetchORS(
  cfg: RoutingConfig,
  waypoints: Coord[],
  mode: RouteMode,
): Promise<RouteResult> {
  // ORS coordinates are [lng, lat]; the `/json` endpoint returns a precision-5 polyline.
  const body = { coordinates: waypoints.map((w) => [w.lng, w.lat]) };
  const headers: Record<string, string> = cfg.orsKey ? { Authorization: cfg.orsKey } : {};
  return parseORS(await postJson(orsUrl(cfg, mode), body, headers));
}

async function fetchOSRM(
  cfg: RoutingConfig,
  waypoints: Coord[],
  mode: RouteMode,
): Promise<RouteResult> {
  // OSRM is a keyless GET; geometry comes back as GeoJSON (no polyline decode).
  return parseOSRM(await getJson(osrmUrl(cfg, waypoints, mode)));
}

// --- Public entry -------------------------------------------------------------

export interface RoutingDeps {
  db: Db;
  config: Config;
  logger: Logger;
  limiter: { take(): boolean };
}

/**
 * Resolve a route through the chosen provider. Cache-first; on a miss, spend a
 * rate-limit token (429 when empty) and call upstream. Returns null only for a
 * degenerate request (<2 waypoints). Upstream/parse failures throw
 * RoutingError(502) — the route handler turns those into a graceful-off
 * `{ route: null }` so the map still draws pins without a connecting line.
 */
export async function getRoute(
  deps: RoutingDeps,
  waypoints: Coord[],
  mode: RouteMode,
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;
  const cfg = deps.config.routing;
  const provider = effectiveProvider(cfg);
  const now = Date.now();
  const key = buildCacheKey(provider, mode, waypoints);

  const cached = readRouteCache(deps.db, key, now);
  if (cached !== undefined) return cached;

  if (!deps.limiter.take()) {
    throw new RoutingError(
      429,
      "route_rate_limited",
      "routing rate limit reached — try again shortly",
    );
  }

  const result =
    provider === "openrouteservice"
      ? await fetchORS(cfg, waypoints, mode)
      : provider === "valhalla"
        ? await fetchValhalla(cfg, waypoints, mode)
        : await fetchOSRM(cfg, waypoints, mode);

  writeRouteCache(deps.db, key, result, now);
  return result;
}

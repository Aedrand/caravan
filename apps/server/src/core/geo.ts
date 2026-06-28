import type { GeoPlace, MapConfig } from "@caravan/shared";
import { eq } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import { schema } from "../db";
import type { Logger } from "../logger";

/**
 * Geo proxy core (C.1, TD-5). All geocoding flows through here — even keyless
 * Photon — so API keys never reach the browser, responses are cached in
 * SQLite, providers are swappable by env, and per-deployment rate limiting is
 * enforced in one place. Pure-ish: provider adapters are the only IO besides
 * the cache and a token-bucket limiter.
 */

type GeoConfig = Config["geo"];

const SEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — addresses move rarely.
const REVERSE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — coords are stable.
const SEARCH_LIMIT = 6;
/** Photon/Nominatim ask for a descriptive UA + contact (their usage policies). */
const USER_AGENT = "Caravan/1.0 (self-hosted; https://github.com/Aedrand/caravan)";

export class GeoError extends Error {
  constructor(
    readonly status: 400 | 429 | 502,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GeoError";
  }
}

export function createRateLimiter(perMinute: number, now: () => number = Date.now) {
  let tokens = perMinute;
  let last = now();
  return {
    /** Returns true if a token was available (and consumed). */
    take(): boolean {
      const t = now();
      const refill = ((t - last) / 60_000) * perMinute;
      if (refill > 0) {
        tokens = Math.min(perMinute, tokens + refill);
        last = t;
      }
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    },
  };
}

function readCache(db: Db, key: string, now: number): unknown | undefined {
  const row = db.select().from(schema.geocodeCache).where(eq(schema.geocodeCache.key, key)).get();
  if (!row) return undefined;
  if (row.expiresAt <= now) return undefined; // stale = miss
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return undefined;
  }
}

function writeCache(db: Db, key: string, value: unknown, ttlMs: number, now: number): void {
  db.insert(schema.geocodeCache)
    .values({ key, value: JSON.stringify(value), createdAt: now, expiresAt: now + ttlMs })
    .onConflictDoUpdate({
      target: schema.geocodeCache.key,
      set: { value: JSON.stringify(value), createdAt: now, expiresAt: now + ttlMs },
    })
    .run();
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new GeoError(502, "geo_upstream_unreachable", `geocoder unreachable: ${String(err)}`);
  }
  if (!res.ok) {
    throw new GeoError(502, "geo_upstream_error", `geocoder returned ${res.status}`);
  }
  return res.json();
}

// --- Provider adapters: each maps a provider response to GeoPlace[] -----------

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Build a human label from GeoJSON `properties` (Photon/Geoapify share this). */
function labelFromProps(p: Record<string, unknown>): { name: string; address?: string } {
  const name = typeof p.name === "string" && p.name ? p.name : undefined;
  const parts = [p.street, p.housenumber, p.city, p.state, p.country].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  const address = parts.length > 0 ? parts.join(", ") : undefined;
  return { name: name ?? address ?? "Unknown place", address };
}

function parsePhoton(json: unknown, provider: string): GeoPlace[] {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: GeoPlace[] = [];
  for (const f of features) {
    const geom = (f as { geometry?: { coordinates?: unknown } }).geometry;
    const coords = geom?.coordinates;
    if (!Array.isArray(coords)) continue;
    const lng = num(coords[0]);
    const lat = num(coords[1]);
    if (lat === undefined || lng === undefined) continue;
    const props = ((f as { properties?: unknown }).properties ?? {}) as Record<string, unknown>;
    const { name, address } = labelFromProps(props);
    const osmType = typeof props.osm_type === "string" ? props.osm_type : undefined;
    const osmId = props.osm_id != null ? String(props.osm_id) : undefined;
    const ref = osmType && osmId ? `${osmType}/${osmId}` : undefined;
    out.push({ name, address, lat, lng, provider, ref });
  }
  return out;
}

function parseLocationIq(json: unknown, provider: string): GeoPlace[] {
  // LocationIQ search returns an array; reverse returns a single object.
  const arr = Array.isArray(json) ? json : [json];
  const out: GeoPlace[] = [];
  for (const item of arr) {
    const o = item as Record<string, unknown>;
    const lat = num(o.lat);
    const lng = num(o.lon);
    if (lat === undefined || lng === undefined) continue;
    const display = typeof o.display_name === "string" ? o.display_name : undefined;
    const name = display?.split(",")[0]?.trim() || display || "Unknown place";
    const ref =
      typeof o.osm_type === "string" && o.osm_id != null
        ? `${o.osm_type}/${String(o.osm_id)}`
        : o.place_id != null
          ? String(o.place_id)
          : undefined;
    out.push({ name, address: display, lat, lng, provider, ref });
  }
  return out;
}

function parseNominatim(json: unknown, provider: string): GeoPlace[] {
  // Reverse returns a single object with `lat`/`lon`/`display_name`.
  return parseLocationIq(json, provider); // identical field shape
}

// --- URL builders -------------------------------------------------------------

function searchUrl(cfg: GeoConfig, q: string): string {
  const provider = cfg.geocodingProvider;
  const lang = cfg.geocodingLanguage;
  if (provider === "geoapify" && cfg.geoapifyKey) {
    const u = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    u.searchParams.set("text", q);
    u.searchParams.set("limit", String(SEARCH_LIMIT));
    u.searchParams.set("format", "geojson");
    u.searchParams.set("apiKey", cfg.geoapifyKey);
    if (lang) u.searchParams.set("lang", lang);
    return u.toString();
  }
  if (provider === "locationiq" && cfg.locationiqKey) {
    const u = new URL("https://api.locationiq.com/v1/autocomplete");
    u.searchParams.set("q", q);
    u.searchParams.set("limit", String(SEARCH_LIMIT));
    u.searchParams.set("key", cfg.locationiqKey);
    if (lang) u.searchParams.set("accept-language", lang);
    return u.toString();
  }
  // Default: Photon (keyless). Also the fallback if a keyed provider has no key.
  const u = new URL("/api", cfg.photonUrl);
  u.searchParams.set("q", q);
  u.searchParams.set("limit", String(SEARCH_LIMIT));
  if (lang) u.searchParams.set("lang", lang);
  return u.toString();
}

function reverseUrl(cfg: GeoConfig, lat: number, lng: number): string {
  const provider = cfg.geocodingProvider;
  const lang = cfg.geocodingLanguage;
  if (provider === "geoapify" && cfg.geoapifyKey) {
    const u = new URL("https://api.geoapify.com/v1/geocode/reverse");
    u.searchParams.set("lat", String(lat));
    u.searchParams.set("lon", String(lng));
    u.searchParams.set("format", "geojson");
    u.searchParams.set("apiKey", cfg.geoapifyKey);
    if (lang) u.searchParams.set("lang", lang);
    return u.toString();
  }
  if (provider === "locationiq" && cfg.locationiqKey) {
    const u = new URL("https://us1.locationiq.com/v1/reverse");
    u.searchParams.set("lat", String(lat));
    u.searchParams.set("lon", String(lng));
    u.searchParams.set("format", "json");
    u.searchParams.set("key", cfg.locationiqKey);
    if (lang) u.searchParams.set("accept-language", lang);
    return u.toString();
  }
  if (provider === "nominatim") {
    const u = new URL("/reverse", cfg.nominatimUrl);
    u.searchParams.set("lat", String(lat));
    u.searchParams.set("lon", String(lng));
    u.searchParams.set("format", "jsonv2");
    if (lang) u.searchParams.set("accept-language", lang);
    return u.toString();
  }
  // Default: Photon reverse (keyless).
  const u = new URL("/reverse", cfg.photonUrl);
  u.searchParams.set("lat", String(lat));
  u.searchParams.set("lon", String(lng));
  if (lang) u.searchParams.set("lang", lang);
  return u.toString();
}

/** Which provider name to stamp on results (and which parser to use). */
function effectiveProvider(cfg: GeoConfig): "photon" | "geoapify" | "locationiq" | "nominatim" {
  const p = cfg.geocodingProvider;
  if (p === "geoapify" && cfg.geoapifyKey) return "geoapify";
  if (p === "locationiq" && cfg.locationiqKey) return "locationiq";
  if (p === "nominatim") return "nominatim";
  return "photon";
}

function parseFor(
  provider: "photon" | "geoapify" | "locationiq" | "nominatim",
  json: unknown,
): GeoPlace[] {
  switch (provider) {
    case "geoapify":
    case "photon":
      return parsePhoton(json, provider);
    case "locationiq":
      return parseLocationIq(json, provider);
    case "nominatim":
      return parseNominatim(json, provider);
  }
}

const OPENFREEMAP_ATTRIBUTION =
  '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors · tiles by <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>';
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/**
 * Map style + attribution for the browser (C.5). Tile keys are injected into
 * the style URL server-side; the default (OpenFreeMap) needs none and is served
 * from its CDN. Falls back to OpenFreeMap whenever a keyed provider lacks a key.
 */
export function buildMapConfig(cfg: GeoConfig): MapConfig {
  if (cfg.tileProvider === "maptiler" && cfg.maptilerKey) {
    return {
      styleUrl: `https://api.maptiler.com/maps/streets-v2/style.json?key=${cfg.maptilerKey}`,
      attribution: `© <a href="https://www.maptiler.com/" target="_blank" rel="noreferrer">MapTiler</a> · ${OSM_ATTRIBUTION}`,
      tileProvider: "maptiler",
    };
  }
  if (cfg.tileProvider === "stadia" && cfg.stadiaKey) {
    return {
      styleUrl: `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${cfg.stadiaKey}`,
      attribution: `© <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> · ${OSM_ATTRIBUTION}`,
      tileProvider: "stadia",
    };
  }
  return {
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    attribution: OPENFREEMAP_ATTRIBUTION,
    tileProvider: "openfreemap",
  };
}

export interface GeoDeps {
  db: Db;
  config: Config;
  logger: Logger;
  limiter: { take(): boolean };
}

/** Forward geocoding / autocomplete (C.1). Cache-first, then upstream. */
export async function geoSearch(deps: GeoDeps, rawQuery: string): Promise<GeoPlace[]> {
  const q = rawQuery.trim();
  if (q.length < 2) throw new GeoError(400, "geo_query_too_short", "query must be ≥2 characters");
  const cfg = deps.config.geo;
  const provider = effectiveProvider(cfg);
  const now = Date.now();
  const key = `${provider}:${cfg.geocodingLanguage}:search:${q.toLowerCase()}`;

  const cached = readCache(deps.db, key, now);
  if (cached !== undefined) return cached as GeoPlace[];

  if (!deps.limiter.take()) {
    throw new GeoError(429, "geo_rate_limited", "geocoder rate limit reached — try again shortly");
  }
  const json = await fetchJson(searchUrl(cfg, q));
  const results = parseFor(provider, json).slice(0, SEARCH_LIMIT);
  writeCache(deps.db, key, results, SEARCH_TTL_MS, now);
  return results;
}

/** Reverse geocoding: coordinate → address (C.1). Cache-first. */
export async function geoReverse(
  deps: GeoDeps,
  lat: number,
  lng: number,
): Promise<GeoPlace | null> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)
    throw new GeoError(400, "geo_bad_lat", "lat must be between -90 and 90");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180)
    throw new GeoError(400, "geo_bad_lng", "lng must be between -180 and 180");
  const cfg = deps.config.geo;
  const provider = effectiveProvider(cfg);
  const now = Date.now();
  // Round to ~11m so nearby clicks share a cache entry.
  const key = `${provider}:${cfg.geocodingLanguage}:reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;

  const cached = readCache(deps.db, key, now);
  if (cached !== undefined) return cached as GeoPlace | null;

  if (!deps.limiter.take()) {
    throw new GeoError(429, "geo_rate_limited", "geocoder rate limit reached — try again shortly");
  }
  const json = await fetchJson(reverseUrl(cfg, lat, lng));
  const place = parseFor(provider, json)[0] ?? null;
  writeCache(deps.db, key, place, REVERSE_TTL_MS, now);
  return place;
}

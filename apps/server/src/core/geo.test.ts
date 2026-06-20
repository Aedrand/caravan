import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { loadConfig } from "../config";
import { createDb } from "../db";
import { createLogger } from "../logger";
import {
  buildMapConfig,
  createRateLimiter,
  ensureGeoCacheTable,
  type GeoDeps,
  GeoError,
  geoReverse,
  geoSearch,
} from "./geo";

const tempDirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deps(overrides: Partial<NodeJS.ProcessEnv> = {}): GeoDeps & { takes: () => number } {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-geo-"));
  tempDirs.push(dir);
  const { db } = createDb(path.join(dir, "test.db"));
  ensureGeoCacheTable(db);
  const config = loadConfig({ DATA_DIR: dir, LOG_LEVEL: "fatal", ...overrides });
  const logger = createLogger(config);
  let takes = 0;
  const limiter = {
    take() {
      takes++;
      return true;
    },
  };
  return { db, config, logger, limiter, takes: () => takes };
}

const photonFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-9.2034, 38.6976] },
  properties: {
    name: "Pastéis de Belém",
    street: "Rua de Belém",
    city: "Lisbon",
    country: "Portugal",
    osm_type: "N",
    osm_id: 12345,
  },
};

function mockFetch(json: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      json: async () => json,
    })),
  );
}

test("rate limiter: refuses once tokens are spent, refills over time", () => {
  let t = 0;
  const limiter = createRateLimiter(2, () => t);
  expect(limiter.take()).toBe(true);
  expect(limiter.take()).toBe(true);
  expect(limiter.take()).toBe(false); // bucket empty
  t = 60_000; // a full minute → full refill
  expect(limiter.take()).toBe(true);
});

test("search: normalizes Photon GeoJSON into GeoPlace[]", async () => {
  mockFetch({ features: [photonFeature] });
  const d = deps();
  const results = await geoSearch(d, "pasteis");
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    name: "Pastéis de Belém",
    lat: 38.6976,
    lng: -9.2034,
    provider: "photon",
    ref: "N/12345",
  });
  expect(results[0]?.address).toContain("Lisbon");
});

test("search: caches — a repeat query does not hit upstream again", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ features: [photonFeature] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const d = deps();
  await geoSearch(d, "lisbon");
  await geoSearch(d, "Lisbon"); // case-insensitive same key
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(d.takes()).toBe(1); // only one token spent (cache hit skips the limiter)
});

test("search: rejects too-short queries before any upstream call", async () => {
  mockFetch({ features: [] });
  const d = deps();
  await expect(geoSearch(d, "a")).rejects.toBeInstanceOf(GeoError);
});

test("search: a spent limiter yields a 429 GeoError", async () => {
  mockFetch({ features: [photonFeature] });
  const d = deps();
  d.limiter.take = () => false;
  await expect(geoSearch(d, "porto")).rejects.toMatchObject({
    status: 429,
    code: "geo_rate_limited",
  });
});

test("reverse: validates coordinates", async () => {
  const d = deps();
  await expect(geoReverse(d, 200, 0)).rejects.toMatchObject({ code: "geo_bad_lat" });
  await expect(geoReverse(d, 0, 999)).rejects.toMatchObject({ code: "geo_bad_lng" });
});

test("reverse: returns the first normalized place, caches null misses", async () => {
  mockFetch({ features: [photonFeature] });
  const d = deps();
  const place = await geoReverse(d, 38.6976, -9.2034);
  expect(place).toMatchObject({ name: "Pastéis de Belém", provider: "photon" });
});

test("upstream non-200 surfaces a 502 GeoError", async () => {
  mockFetch({}, false, 503);
  const d = deps();
  await expect(geoSearch(d, "lisbon")).rejects.toMatchObject({ status: 502 });
});

test("provider selection: locationiq key routes to its parser and stamps provenance", async () => {
  mockFetch([
    {
      lat: "41.1579",
      lon: "-8.6291",
      display_name: "Porto, Portugal",
      osm_type: "relation",
      osm_id: 999,
    },
  ]);
  const d = deps({ GEOCODING_PROVIDER: "locationiq", LOCATIONIQ_KEY: "k" });
  const results = await geoSearch(d, "porto");
  expect(results[0]).toMatchObject({ name: "Porto", provider: "locationiq", ref: "relation/999" });
});

test("provider selection: keyed provider without a key falls back to keyless Photon", async () => {
  mockFetch({ features: [photonFeature] });
  const d = deps({ GEOCODING_PROVIDER: "geoapify" }); // no GEOAPIFY_KEY
  const results = await geoSearch(d, "lisbon");
  expect(results[0]?.provider).toBe("photon");
});

test("map config: keyless OpenFreeMap default carries attribution", () => {
  const d = deps();
  const cfg = buildMapConfig(d.config.geo);
  expect(cfg.tileProvider).toBe("openfreemap");
  expect(cfg.styleUrl).toContain("openfreemap.org");
  expect(cfg.attribution).toContain("OpenStreetMap");
});

test("map config: MapTiler key injects the key server-side", () => {
  const d = deps({ TILE_PROVIDER: "maptiler", MAPTILER_KEY: "secret" });
  const cfg = buildMapConfig(d.config.geo);
  expect(cfg.tileProvider).toBe("maptiler");
  expect(cfg.styleUrl).toContain("key=secret");
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Coord } from "@caravan/shared";
import { Hono } from "hono";
import { afterEach, expect, test, vi } from "vitest";
import { loadConfig } from "../config";
import { createDb } from "../db";
import { runMigrations } from "../db/migrate";
import { createRoutingRoutes } from "../features/routing/routes";
import { createLogger } from "../logger";
import {
  buildCacheKey,
  decodePolyline5,
  decodePolyline6,
  getRoute,
  normalizeCoords,
  parseORS,
  parseValhalla,
  type RoutingDeps,
  RoutingError,
} from "./routing";

const tempDirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deps(overrides: Partial<NodeJS.ProcessEnv> = {}): RoutingDeps & { takes: () => number } {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-route-"));
  tempDirs.push(dir);
  const { db } = createDb(path.join(dir, "test.db"));
  runMigrations(db);
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

// --- Polyline test helpers ----------------------------------------------------

/** Reference Google-polyline encoder ([lat, lng] in, `factor` precision). */
function encodePolyline(coords: [number, number][], factor: number): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = "";
  const encodeSigned = (value: number): string => {
    let sgn = value << 1;
    if (value < 0) sgn = ~sgn;
    let s = "";
    while (sgn >= 0x20) {
      s += String.fromCharCode((0x20 | (sgn & 0x1f)) + 63);
      sgn >>= 5;
    }
    s += String.fromCharCode(sgn + 63);
    return s;
  };
  for (const [lat, lng] of coords) {
    const iLat = Math.round(lat * factor);
    const iLng = Math.round(lng * factor);
    out += encodeSigned(iLat - prevLat);
    out += encodeSigned(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

const TOKYO_PATH: [number, number][] = [
  [35.6586, 139.7454],
  [35.6595, 139.746],
  [35.661, 139.7488],
];
/** Same path swapped to GeoJSON `[lng, lat]` — what the decoders must produce. */
const TOKYO_LNGLAT = TOKYO_PATH.map(([lat, lng]) => [lng, lat]) as [number, number][];

function expectGeometryClose(actual: [number, number][], expected: [number, number][]) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]?.[0]).toBeCloseTo(expected[i]?.[0] as number, 5);
    expect(actual[i]?.[1]).toBeCloseTo(expected[i]?.[1] as number, 5);
  }
}

function valhallaResponse(legShapes: string[]): unknown {
  return {
    trip: {
      status: 0,
      status_message: "Found route between points",
      legs: legShapes.map((shape) => ({ summary: { time: 120, length: 0.5 }, shape })),
      summary: { time: 120 * legShapes.length, length: 0.5 * legShapes.length },
    },
  };
}

function mockFetch(json: unknown, ok = true, status = 200) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok,
    status,
    json: async () => json,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const WAYPOINTS: Coord[] = [
  { lat: 35.6586, lng: 139.7454 },
  { lat: 35.661, lng: 139.7488 },
];

// --- decodePolyline -----------------------------------------------------------

test("decodePolyline6: round-trips an encoded path into [lng, lat] pairs", () => {
  const encoded = encodePolyline(TOKYO_PATH, 1e6);
  expectGeometryClose(decodePolyline6(encoded), TOKYO_LNGLAT);
});

test("decodePolyline5: round-trips at precision 5 into [lng, lat] pairs", () => {
  const encoded = encodePolyline(TOKYO_PATH, 1e5);
  expectGeometryClose(decodePolyline5(encoded), TOKYO_LNGLAT);
});

test("decodePolyline6: empty string decodes to no points", () => {
  expect(decodePolyline6("")).toEqual([]);
});

// --- normalizeCoords / buildCacheKey -----------------------------------------

test("normalizeCoords: truncates to 5 decimal places", () => {
  expect(normalizeCoords([{ lat: 35.123456789, lng: 139.987654321 }])).toEqual([
    { lat: 35.12345, lng: 139.98765 },
  ]);
});

test("buildCacheKey: stable for coords agreeing within 5 dp, varies by mode/provider", () => {
  const a = buildCacheKey("valhalla", "walking", WAYPOINTS);
  const b = buildCacheKey("valhalla", "walking", [
    { lat: 35.6586001, lng: 139.7454001 },
    { lat: 35.661, lng: 139.7488 },
  ]);
  expect(a).toBe(b); // 6th-decimal jitter collapses to the same key
  expect(a).not.toBe(buildCacheKey("valhalla", "driving", WAYPOINTS));
  expect(a).not.toBe(buildCacheKey("openrouteservice", "walking", WAYPOINTS));
  expect(a.startsWith("valhalla:walking:")).toBe(true);
});

// --- parseValhalla ------------------------------------------------------------

test("parseValhalla: decodes shape to [lng, lat], km→m, time in seconds", () => {
  const result = parseValhalla(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  expectGeometryClose(result.geometry, TOKYO_LNGLAT);
  expect(result.legs).toEqual([{ durationSeconds: 120, distanceMeters: 500 }]);
  expect(result.durationSeconds).toBe(120);
  expect(result.distanceMeters).toBe(500);
});

test("parseValhalla: concatenates multi-leg shapes, deduping the shared boundary point", () => {
  const leg1: [number, number][] = [
    [35.6586, 139.7454],
    [35.6595, 139.746],
  ];
  const leg2: [number, number][] = [
    [35.6595, 139.746], // shared with leg1's tail
    [35.661, 139.7488],
  ];
  const result = parseValhalla(
    valhallaResponse([encodePolyline(leg1, 1e6), encodePolyline(leg2, 1e6)]),
  );
  // 2 + 2 points minus the 1 deduped boundary = 3 unique points.
  expectGeometryClose(result.geometry, TOKYO_LNGLAT);
  expect(result.legs).toHaveLength(2);
});

test("parseValhalla: a non-zero status throws a 502 RoutingError", () => {
  expect(() => parseValhalla({ trip: { status: 442, legs: [] } })).toThrow(RoutingError);
});

// --- parseORS -----------------------------------------------------------------

test("parseORS: maps segments→legs and decodes the precision-5 geometry", () => {
  const json = {
    routes: [
      {
        summary: { duration: 333, distance: 1234 },
        geometry: encodePolyline(TOKYO_PATH, 1e5),
        segments: [
          { duration: 100, distance: 400 },
          { duration: 233, distance: 834 },
        ],
      },
    ],
  };
  const result = parseORS(json);
  expectGeometryClose(result.geometry, TOKYO_LNGLAT);
  expect(result.legs).toEqual([
    { durationSeconds: 100, distanceMeters: 400 },
    { durationSeconds: 233, distanceMeters: 834 },
  ]);
  expect(result.durationSeconds).toBe(333);
  expect(result.distanceMeters).toBe(1234);
});

test("parseORS: no routes throws a 502 RoutingError", () => {
  expect(() => parseORS({ routes: [] })).toThrow(RoutingError);
});

// --- getRoute (cache + rate limit) -------------------------------------------

test("getRoute: cache miss calls upstream and returns a RouteResult", async () => {
  const fetchMock = mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const d = deps();
  const result = await getRoute(d, WAYPOINTS, "walking");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result?.legs).toEqual([{ durationSeconds: 120, distanceMeters: 500 }]);
  expectGeometryClose(result?.geometry ?? [], TOKYO_LNGLAT);
});

test("getRoute: a second identical call is a cache hit (no upstream, no token spent)", async () => {
  const fetchMock = mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const d = deps();
  await getRoute(d, WAYPOINTS, "walking");
  await getRoute(d, WAYPOINTS, "walking");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(d.takes()).toBe(1); // cache hit skips the limiter
});

test("getRoute: walking sends Valhalla pedestrian costing + kilometers units", async () => {
  const fetchMock = mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const d = deps();
  await getRoute(d, WAYPOINTS, "walking");
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(body.costing).toBe("pedestrian");
  expect(body.directions_options.units).toBe("kilometers");
  expect(body.locations).toEqual([
    { lat: 35.6586, lon: 139.7454 },
    { lat: 35.661, lon: 139.7488 },
  ]);
});

test("getRoute: driving sends Valhalla auto costing", async () => {
  const fetchMock = mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const d = deps();
  await getRoute(d, WAYPOINTS, "driving");
  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(body.costing).toBe("auto");
});

test("getRoute: a saturated limiter throws a 429 RoutingError", async () => {
  mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const d = deps();
  d.limiter.take = () => false;
  await expect(getRoute(d, WAYPOINTS, "walking")).rejects.toMatchObject({
    status: 429,
    code: "route_rate_limited",
  });
});

test("getRoute: fewer than 2 waypoints short-circuits to null (no upstream)", async () => {
  const fetchMock = mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const d = deps();
  expect(await getRoute(d, [WAYPOINTS[0] as Coord], "walking")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("getRoute: an upstream non-200 throws a 502 RoutingError", async () => {
  mockFetch({}, false, 503);
  const d = deps();
  await expect(getRoute(d, WAYPOINTS, "walking")).rejects.toMatchObject({ status: 502 });
});

test("getRoute: ORS provider with a key routes through the ORS profile endpoint", async () => {
  const fetchMock = mockFetch({
    routes: [
      {
        summary: { duration: 50, distance: 100 },
        geometry: encodePolyline(TOKYO_PATH, 1e5),
        segments: [{ duration: 50, distance: 100 }],
      },
    ],
  });
  const d = deps({
    ROUTING_PROVIDER: "openrouteservice",
    ORS_KEY: "k",
    ROUTING_URL: "https://ors.example.com",
  });
  const result = await getRoute(d, WAYPOINTS, "driving");
  const url = String(fetchMock.mock.calls[0]?.[0]);
  expect(url).toBe("https://ors.example.com/v2/directions/driving-car/json");
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "k" });
  expect(result?.distanceMeters).toBe(100);
});

test("getRoute: ORS selected but keyless falls back to keyless Valhalla", async () => {
  const fetchMock = mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const d = deps({ ROUTING_PROVIDER: "openrouteservice" }); // no ORS_KEY
  await getRoute(d, WAYPOINTS, "walking");
  const url = String(fetchMock.mock.calls[0]?.[0]);
  expect(url).toContain("/route"); // Valhalla endpoint, not ORS
});

// --- Integration via app.request ---------------------------------------------

function routeApp(env: Partial<NodeJS.ProcessEnv> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-routeapp-"));
  tempDirs.push(dir);
  const { db } = createDb(path.join(dir, "test.db"));
  runMigrations(db);
  const config = loadConfig({ DATA_DIR: dir, LOG_LEVEL: "fatal", ...env });
  const logger = createLogger(config);
  return new Hono().route("/api/route", createRoutingRoutes({ db, config, logger }));
}

function postRoute(app: Hono, body: unknown) {
  return app.request("/api/route", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /api/route: valid body returns the resolved route", async () => {
  mockFetch(valhallaResponse([encodePolyline(TOKYO_PATH, 1e6)]));
  const res = await postRoute(routeApp(), { waypoints: WAYPOINTS, mode: "walking" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { route: { geometry: unknown[] } | null };
  expect(body.route).not.toBeNull();
  expect(body.route?.geometry.length).toBe(TOKYO_LNGLAT.length);
});

test("POST /api/route: a malformed upstream is graceful-off — { route: null } at HTTP 200", async () => {
  mockFetch({ trip: { status: 1, legs: [] } }); // no routed trip
  const res = await postRoute(routeApp(), { waypoints: WAYPOINTS, mode: "walking" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ route: null });
});

test("POST /api/route: an unreachable upstream is graceful-off — { route: null } at HTTP 200", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }),
  );
  const res = await postRoute(routeApp(), { waypoints: WAYPOINTS, mode: "driving" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ route: null });
});

test("POST /api/route: a malformed body is a 400 (not graceful-off)", async () => {
  const res = await postRoute(routeApp(), { waypoints: [WAYPOINTS[0]], mode: "walking" });
  expect(res.status).toBe(400);
});

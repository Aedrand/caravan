import type { GeoReverseResponse, GeoSearchResponse, MapConfig } from "@caravan/shared";
import { type Context, Hono } from "hono";
import type { AuthedEnv } from "../../auth/session";
import type { Config } from "../../config";
import { buildMapConfig, createRateLimiter, GeoError, geoReverse, geoSearch } from "../../core/geo";
import type { Db } from "../../db";
import type { Logger } from "../../logger";

/**
 * Geo proxy routes (C.1, TD-5), mounted at /api/geo behind requireUser. Every
 * geocoding request — even keyless Photon — passes through here so keys stay
 * server-side, responses cache in SQLite, and one rate limiter protects the
 * (often donated) upstream instance.
 */
export function createGeoRoutes(deps: { db: Db; config: Config; logger: Logger }) {
  const { db, config, logger } = deps;
  const limiter = createRateLimiter(config.geo.rateLimitPerMinute);
  const geoDeps = { db, config, logger, limiter };

  const onError = (err: unknown, c: Context<AuthedEnv>) => {
    if (err instanceof GeoError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    logger.error({ err }, "geo proxy error");
    return c.json({ error: { code: "geo_internal", message: "geocoding failed" } }, 502);
  };

  return new Hono<AuthedEnv>()
    .get("/map-config", (c) => c.json<MapConfig>(buildMapConfig(config.geo)))
    .get("/search", async (c) => {
      const q = c.req.query("q") ?? "";
      try {
        const results = await geoSearch(geoDeps, q);
        return c.json<GeoSearchResponse>({ results });
      } catch (err) {
        return onError(err, c);
      }
    })
    .get("/reverse", async (c) => {
      const lat = Number(c.req.query("lat"));
      const lng = Number(c.req.query("lng"));
      try {
        const place = await geoReverse(geoDeps, lat, lng);
        return c.json<GeoReverseResponse>({ place });
      } catch (err) {
        return onError(err, c);
      }
    });
}

export type GeoRoutes = ReturnType<typeof createGeoRoutes>;

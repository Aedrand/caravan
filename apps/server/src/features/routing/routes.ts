import { RouteRequestSchema, type RouteResponse } from "@caravan/shared";
import { type Context, Hono } from "hono";
import type { AuthedEnv } from "../../auth/session";
import type { Config } from "../../config";
import { createRateLimiter, getRoute, RoutingError } from "../../core/routing";
import type { Db } from "../../db";
import type { Logger } from "../../logger";

/**
 * Routing proxy routes (V2.5), mounted at /api/route behind requireUser. Mirror
 * of the geo proxy: keys + rate limit stay server-side, responses cache in
 * SQLite. Failure policy is GRACEFUL-OFF — an unreachable or unparseable
 * upstream returns `{ route: null }` with HTTP 200 (the map shows pins without a
 * connecting line); only genuine client errors (malformed body → 400, rate
 * limit → 429) get a non-200.
 */
export function createRoutingRoutes(deps: { db: Db; config: Config; logger: Logger }) {
  const { db, config, logger } = deps;
  const limiter = createRateLimiter(config.routing.rateLimitPerMinute);
  const routingDeps = { db, config, logger, limiter };

  return new Hono<AuthedEnv>().post("/", async (c: Context<AuthedEnv>) => {
    const parsed = RouteRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { error: { code: "route_bad_request", message: "invalid route request" } },
        400,
      );
    }
    try {
      const route = await getRoute(routingDeps, parsed.data.waypoints, parsed.data.mode);
      return c.json<RouteResponse>({ route });
    } catch (err) {
      // Rate limiting is the one upstream-protection signal worth surfacing.
      if (err instanceof RoutingError && err.status === 429) {
        return c.json({ error: { code: err.code, message: err.message } }, 429);
      }
      // Everything else (upstream down, bad upstream payload) → graceful-off.
      logger.warn({ err }, "route proxy failure — returning null route");
      return c.json<RouteResponse>({ route: null });
    }
  });
}

export type RoutingRoutes = ReturnType<typeof createRoutingRoutes>;

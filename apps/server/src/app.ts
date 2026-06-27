import { existsSync } from "node:fs";
import path from "node:path";
import { upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Auth } from "./auth";
import { requireAdmin } from "./auth/admin";
import { type AuthedEnv, requireUser } from "./auth/session";
import type { Config } from "./config";
import { rateLimit } from "./core/rate-limit";
import { createSyncRoutes } from "./core/sync";
import type { TripRooms } from "./core/ws";
import type { Db } from "./db";
import { createAdminRoutes } from "./features/admin/routes";
import { createExpensesRoutes } from "./features/expenses/routes";
import { createGeoRoutes } from "./features/geo/routes";
import { createInviteRoutes } from "./features/trips/invite-routes";
import { createTripsRoutes } from "./features/trips/routes";
import type { Logger } from "./logger";

export interface AppDeps {
  config: Config;
  db: Db;
  logger: Logger;
  auth: Auth;
  rooms: TripRooms;
}

/**
 * App factory (M0.5): API under /api, static SPA with fallback for everything
 * else. Separated from the listener so tests call `app.request()` directly
 * and the typed `hc` client can be derived from `AppType`.
 */
export function createApp({ config, db, logger, auth, rooms }: AppDeps) {
  // Trip workspace: CRUD (M1.1) + the sync contract surface (M1.3) behind one
  // session gate — sub-apps assume c.get("user") and do their own membership checks.
  const trips = new Hono<AuthedEnv>()
    .use("*", requireUser(auth))
    .route("/", createTripsRoutes({ db, logger }))
    .route("/", createExpensesRoutes({ db }))
    .route("/", createSyncRoutes({ db, rooms, logger, upgradeWebSocket }));

  // Geo proxy (Track C): session-gated; keeps geocoder keys + rate limit server-side.
  const geo = new Hono<AuthedEnv>()
    .use("*", requireUser(auth))
    .route("/", createGeoRoutes({ db, config, logger }));

  // Instance admin (Track D): session-gated AND admin-only. D.3 fills in the router.
  const admin = new Hono<AuthedEnv>()
    .use("*", requireUser(auth))
    .use("*", requireAdmin())
    .route("/", createAdminRoutes({ db }));

  const api = new Hono()
    .get("/health", (c) => c.json({ status: "ok", service: "caravan" }))
    .route("/trips", trips)
    .route("/geo", geo)
    .route("/admin", admin)
    // Invite door: GET info is public; accept gates itself on a session.
    .route("/invites", createInviteRoutes({ db, rooms, logger, requireUser: requireUser(auth) }));

  // Rate limiting (D.6) is disabled under NODE_ENV=test so the unit suite and the
  // Playwright M1 gate (which fire many requests fast from one IP) never trip it;
  // dev/prod defaults (300/min general, 20/min auth) stay well clear of normal use.
  const rateLimitEnabled = config.nodeEnv !== "test";

  // Strict brute-force guard for the auth surface — applied ONLY to credential
  // POSTs (sign-in/sign-up/…). Better Auth polls GET /api/auth/get-session on
  // every page load, so counting reads against the strict cap would 429 normal
  // use; those fall under the general /api limiter instead.
  const authLimiter = rateLimit({
    limit: config.rateLimit.authMax,
    windowMs: config.rateLimit.windowMs,
    enabled: rateLimitEnabled,
  });

  const app = new Hono()
    .use("*", async (c, next) => {
      const start = performance.now();
      await next();
      logger.debug(
        {
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          ms: Math.round(performance.now() - start),
        },
        "request",
      );
    })
    // Safe response headers on everything. No strict CSP here on purpose: the SPA
    // pulls MapLibre + external tiles (OpenFreeMap), Photon geocoding, and WS, so a
    // wrong policy would break the map. A real (report-only first) CSP is a follow-up.
    .use("*", async (c, next) => {
      await next();
      c.header("X-Content-Type-Options", "nosniff");
      c.header("X-Frame-Options", "SAMEORIGIN");
      c.header("Referrer-Policy", "strict-origin-when-cross-origin");
      c.header("X-DNS-Prefetch-Control", "off");
      c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    })
    // Stricter limiter for the auth surface (brute-force guard); POST-only so it
    // wraps credential submissions but not the frequent get-session reads.
    .use("/api/auth/*", (c, next) =>
      c.req.method === "POST" ? authLimiter(c, next) : next(),
    )
    // General limiter for the rest of the API.
    .use(
      "/api/*",
      rateLimit({
        limit: config.rateLimit.max,
        windowMs: config.rateLimit.windowMs,
        enabled: rateLimitEnabled,
      }),
    )
    // Better Auth owns /api/auth/* (sign-up, sign-in, session, sign-out, …)
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    .route("/api", api)
    // unknown API routes are JSON 404s, never the SPA fallback
    .all("/api/*", (c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: { code: "http_error", message: err.message } }, err.status);
    }
    logger.error({ err, path: c.req.path }, "unhandled error");
    return c.json({ error: { code: "internal", message: "Internal server error" } }, 500);
  });

  // Serve the built SPA when present (production); in dev, Vite serves it.
  if (existsSync(config.webDist)) {
    const root = path.relative(process.cwd(), config.webDist);
    app.use("*", serveStatic({ root }));
    app.get("*", serveStatic({ path: path.join(root, "index.html") }));
  } else {
    logger.info({ webDist: config.webDist }, "no web build found — dev mode, Vite serves the SPA");
  }

  return app;
}

export type App = ReturnType<typeof createApp>;

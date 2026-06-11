import { existsSync } from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Config } from "./config";
import type { Db } from "./db";
import type { Logger } from "./logger";

export interface AppDeps {
  config: Config;
  db: Db;
  logger: Logger;
}

/**
 * App factory (M0.5): API under /api, static SPA with fallback for everything
 * else. Separated from the listener so tests call `app.request()` directly
 * and the typed `hc` client can be derived from `AppType`.
 */
export function createApp({ config, logger }: AppDeps) {
  const api = new Hono().get("/health", (c) => c.json({ status: "ok", service: "caravan" }));

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

import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { ensureAdminUser } from "./auth/bootstrap";
import { loadConfig } from "./config";
import { createJobRegistry } from "./core/jobs";
import { pruneRouteCache } from "./core/routing";
import { createTripRooms } from "./core/ws";
import { createDb } from "./db";
import { runMigrations } from "./db/migrate";
// Side-effect: register every feature's mutation handlers with the pipeline.
import "./features";
import { runDailyDigest } from "./features/notifications/digest";
// Track A: temporary DDL until the integrator generates the migration (anti-collision rule 1).
import { findValidInvite } from "./features/trips/invites";
import { createLogger } from "./logger";
import { createEmailService } from "./services/email";

/** Boot order (TD-4): config → logger → DB + migrations (fail-fast) → auth → serve. */
async function main() {
  const config = loadConfig();
  const logger = createLogger(config);

  let db: ReturnType<typeof createDb>;
  try {
    db = createDb(config.dbPath);
    runMigrations(db.db);
    logger.info({ dbPath: config.dbPath }, "database ready");
  } catch (err) {
    logger.fatal({ err }, "database migration failed — refusing to start");
    process.exit(1);
  }

  const auth = createAuth({
    db: db.db,
    config,
    isInviteTokenValid: (token) => findValidInvite(db.db, token, Date.now()) !== undefined,
  });
  await ensureAdminUser({ auth, db: db.db, config, logger });

  const email = createEmailService(config, logger);
  if (email.enabled) {
    logger.info({ smtpHost: config.smtp.host }, "email enabled");
  } else {
    logger.info("email disabled — SMTP not configured (SMTP_HOST/SMTP_FROM)");
  }

  const jobs = createJobRegistry(logger);
  const rooms = createTripRooms(logger);
  rooms.startHeartbeat();
  const app = createApp({ config, db: db.db, logger, auth, rooms, email });

  // Reclaim expired rate-limit windows so the keyed Map stays bounded under many
  // unique client IPs (the limiters prune lazily on hit, but idle keys linger).
  jobs.register("rate-limit-prune", "*/10 * * * *", () => app.pruneRateLimiters());

  // Daily digest (D.2): per-trip activity summary email. Stubbed for now; safe to
  // schedule since sendMail no-ops when email is disabled.
  jobs.register("daily-digest", config.digestCron, () =>
    runDailyDigest({ db: db.db, logger, config, email }),
  );

  // Reclaim expired route-cache rows (V2.5) every 6h so the table stays bounded
  // (entries also expire lazily as misses, but pruning frees the storage).
  jobs.register("route-cache-prune", "0 */6 * * *", () => pruneRouteCache(db.db));

  // noServer is required — the Hono adapter handles the HTTP upgrade itself.
  const wss = new WebSocketServer({ noServer: true });
  const server = serve(
    { fetch: app.fetch, port: config.port, websocket: { server: wss } },
    (info) => {
      logger.info({ port: info.port, baseUrl: config.baseUrl }, "caravan server listening");
    },
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    jobs.stop();
    rooms.shutdown();
    server.close(() => {
      db.sqlite.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main();

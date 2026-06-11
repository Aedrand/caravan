import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { ensureAdminUser } from "./auth/bootstrap";
import { loadConfig } from "./config";
import { createJobRegistry } from "./core/jobs";
import { createDb } from "./db";
import { runMigrations } from "./db/migrate";
import { createLogger } from "./logger";

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

  const auth = createAuth({ db: db.db, config });
  await ensureAdminUser({ auth, db: db.db, config, logger });

  const jobs = createJobRegistry(logger);
  const app = createApp({ config, db: db.db, logger, auth });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info({ port: info.port, baseUrl: config.baseUrl }, "caravan server listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    jobs.stop();
    server.close(() => {
      db.sqlite.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main();

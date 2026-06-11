import { count } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import { schema } from "../db";
import type { Logger } from "../logger";
import type { Auth } from "./index";

export interface BootstrapDeps {
  auth: Auth;
  db: Db;
  config: Pick<Config, "adminEmail" | "adminPassword">;
  logger: Logger;
}

/**
 * Env-preseeded admin (TD-4 first-run flow): if ADMIN_EMAIL/ADMIN_PASSWORD
 * are set and no users exist, create the admin account at boot. Otherwise
 * the first person to register becomes admin (auth create hook).
 */
export async function ensureAdminUser({ auth, db, config, logger }: BootstrapDeps): Promise<void> {
  if (!config.adminEmail || !config.adminPassword) return;

  const users = db.select({ n: count() }).from(schema.user).get()?.n ?? 0;
  if (users > 0) return;

  await auth.api.signUpEmail({
    body: {
      name: config.adminEmail.split("@")[0] ?? "Admin",
      email: config.adminEmail,
      password: config.adminPassword,
    },
  });
  logger.info({ email: config.adminEmail }, "admin account pre-seeded from env");
}

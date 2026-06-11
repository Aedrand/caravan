import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * All deployment configuration comes from env vars with aggressive defaults
 * (TD-4): the only secret, SECRET_KEY, is auto-generated and persisted to the
 * data volume on first boot, so true minimum config is zero env vars.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Directory holding the SQLite DB, generated secret, and future uploads. */
  DATA_DIR: z.string().default("./data"),
  /** Public URL used in links/emails; only needed behind a reverse proxy. */
  BASE_URL: z.url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** Session/JWT signing key; auto-generated into DATA_DIR when unset. */
  SECRET_KEY: z.string().min(32).optional(),
  /** Built SPA location, served statically in production. */
  WEB_DIST: z.string().default("../web/dist"),
  /** Optional first-boot admin pre-seed (TD-4); ignored once users exist. */
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.parse(env);
  const dataDir = path.resolve(parsed.DATA_DIR);
  mkdirSync(dataDir, { recursive: true });

  return {
    nodeEnv: parsed.NODE_ENV,
    isDev: parsed.NODE_ENV === "development",
    port: parsed.PORT,
    dataDir,
    dbPath: path.join(dataDir, "caravan.db"),
    baseUrl: parsed.BASE_URL ?? `http://localhost:${parsed.PORT}`,
    logLevel: parsed.LOG_LEVEL,
    secretKey: parsed.SECRET_KEY ?? loadOrCreateSecretKey(dataDir),
    webDist: path.resolve(parsed.WEB_DIST),
    adminEmail: parsed.ADMIN_EMAIL,
    adminPassword: parsed.ADMIN_PASSWORD,
  };
}

function loadOrCreateSecretKey(dataDir: string): string {
  const secretPath = path.join(dataDir, "secret_key");
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf8").trim();
  }
  const key = randomBytes(32).toString("base64url");
  writeFileSync(secretPath, `${key}\n`, { mode: 0o600 });
  // logger isn't constructed until config exists, so plain console here
  console.warn(`SECRET_KEY not set — generated one and saved it to ${secretPath}`);
  return key;
}

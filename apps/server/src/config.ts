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

  // --- Maps & geocoding (TD-5, Track C). All optional: defaults are keyless. ---
  /** Forward/reverse geocoder. Photon (default) is keyless; others need a key. */
  GEOCODING_PROVIDER: z.enum(["photon", "geoapify", "locationiq", "nominatim"]).default("photon"),
  /** Override the Photon base URL — e.g. a self-hosted regional Photon (TD-5 heavy mode). */
  PHOTON_URL: z.url().default("https://photon.komoot.io"),
  /** Geoapify key — preferred keyed upgrade (3k req/day free). */
  GEOAPIFY_KEY: z.string().min(1).optional(),
  /** LocationIQ key (5k/day; attribution link required). */
  LOCATIONIQ_KEY: z.string().min(1).optional(),
  /** Nominatim base URL — only legitimate for reverse geocoding (TD-5). */
  NOMINATIM_URL: z.url().default("https://nominatim.openstreetmap.org"),
  /** Per-deployment geo rate limit: max upstream requests per minute. */
  GEO_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /** Vector tile source for the browser map (TD-5). OpenFreeMap is keyless. */
  TILE_PROVIDER: z.enum(["openfreemap", "maptiler", "stadia"]).default("openfreemap"),
  /** MapTiler key — nicer tile styles (non-commercial free tier). */
  MAPTILER_KEY: z.string().min(1).optional(),
  /** Stadia key — alternative keyed tile styles. */
  STADIA_KEY: z.string().min(1).optional(),

  // --- Operations: replication & rate limiting (Track D) -----------------------
  /** Litestream replica target (D.4). Surfaced for the Docker entrypoint; the app itself doesn't read it. */
  LITESTREAM_REPLICA_URL: z.string().optional(),
  /** Rate-limit window length in ms (D.6). */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  /** Max requests per window per client for /api. Generous so normal use + the M1 e2e gate never trip it. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Stricter per-window cap for /api/auth/* (sign-in/up brute-force guard). */
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
  /**
   * Honour `X-Forwarded-For` for client identity (rate-limit keying). Leave OFF
   * unless Caravan sits behind a trusted reverse proxy — a direct client can
   * forge the header to dodge the limiter. Accepts true/1/yes.
   */
  TRUST_PROXY: z
    .enum(["true", "false", "1", "0", "yes", "no"])
    .default("false")
    .transform((v) => v === "true" || v === "1" || v === "yes"),
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
    geo: {
      geocodingProvider: parsed.GEOCODING_PROVIDER,
      photonUrl: parsed.PHOTON_URL,
      geoapifyKey: parsed.GEOAPIFY_KEY,
      locationiqKey: parsed.LOCATIONIQ_KEY,
      nominatimUrl: parsed.NOMINATIM_URL,
      rateLimitPerMinute: parsed.GEO_RATE_LIMIT_PER_MINUTE,
      tileProvider: parsed.TILE_PROVIDER,
      maptilerKey: parsed.MAPTILER_KEY,
      stadiaKey: parsed.STADIA_KEY,
    },
    /** Surfaced for D.4's Docker entrypoint; the app process itself ignores it. */
    litestreamReplicaUrl: parsed.LITESTREAM_REPLICA_URL,
    rateLimit: {
      windowMs: parsed.RATE_LIMIT_WINDOW_MS,
      max: parsed.RATE_LIMIT_MAX,
      authMax: parsed.RATE_LIMIT_AUTH_MAX,
    },
    /** Trust X-Forwarded-For for client identity — only behind a trusted proxy. */
    trustProxy: parsed.TRUST_PROXY,
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

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterAll, expect, test } from "vitest";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { loadConfig } from "./config";
import { createTripRooms } from "./core/ws";
import { createDb } from "./db";
import { runMigrations } from "./db/migrate";

const dataDir = mkdtempSync(path.join(tmpdir(), "caravan-app-"));
const config = loadConfig({
  DATA_DIR: dataDir,
  NODE_ENV: "test",
  WEB_DIST: path.join(dataDir, "no-web-build"),
});
const { db, sqlite } = createDb(config.dbPath);
runMigrations(db);
const auth = createAuth({ db, config });
const silentLogger = pino({ level: "silent" });
const app = createApp({
  config,
  db,
  logger: silentLogger,
  auth,
  rooms: createTripRooms(silentLogger),
});

afterAll(() => {
  sqlite.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("GET /api/health returns ok", async () => {
  const res = await app.request("/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", service: "caravan" });
});

test("unknown API routes return a JSON 404 envelope, not the SPA", async () => {
  const res = await app.request("/api/nope");
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
});

// Track C: geo proxy mounts and is session-gated (keys + rate limit stay server-side).
test("GET /api/geo/map-config requires a session", async () => {
  const res = await app.request("/api/geo/map-config");
  expect(res.status).toBe(401);
});

test("GET /api/geo/search requires a session", async () => {
  const res = await app.request("/api/geo/search?q=lisbon");
  expect(res.status).toBe(401);
});

// Track D: notification prefs mount under /api/me and are session-gated.
test("GET /api/me/notification-prefs requires a session", async () => {
  const res = await app.request("/api/me/notification-prefs");
  expect(res.status).toBe(401);
});

test("PUT /api/me/notification-prefs requires a session", async () => {
  const res = await app.request("/api/me/notification-prefs", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digestEnabled: false }),
  });
  expect(res.status).toBe(401);
});

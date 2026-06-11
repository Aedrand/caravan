import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterAll, expect, test } from "vitest";
import { createApp } from "../app";
import { loadConfig } from "../config";
import { setSetting } from "../core/settings";
import { createTripRooms } from "../core/ws";
import { createDb } from "../db";
import { runMigrations } from "../db/migrate";
import { ensureAdminUser } from "./bootstrap";
import { createAuth } from "./index";

const silentLogger = pino({ level: "silent" });
const tempDirs: string[] = [];

function testHarness(
  env: Record<string, string> = {},
  opts: { isInviteTokenValid?: (token: string) => boolean } = {},
) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "caravan-auth-"));
  tempDirs.push(dataDir);
  const config = loadConfig({
    DATA_DIR: dataDir,
    NODE_ENV: "test",
    WEB_DIST: path.join(dataDir, "no-web-build"),
    ...env,
  });
  const { db, sqlite } = createDb(config.dbPath);
  runMigrations(db);
  const auth = createAuth({ db, config, isInviteTokenValid: opts.isInviteTokenValid });
  const app = createApp({
    config,
    db,
    logger: silentLogger,
    auth,
    rooms: createTripRooms(silentLogger),
  });
  return { app, db, sqlite, auth, config };
}

function signUp(
  app: ReturnType<typeof testHarness>["app"],
  name: string,
  email: string,
  headers: Record<string, string> = {},
) {
  return app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ name, email, password: "correct-horse-battery" }),
  });
}

afterAll(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("first sign-up succeeds, becomes instance admin, and gets a session", async () => {
  const { app, sqlite } = testHarness();

  const res = await signUp(app, "Andrew", "andrew@example.com");
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("better-auth.session_token");

  const row = sqlite.prepare("select role from user where email = ?").get("andrew@example.com");
  expect(row).toEqual({ role: "admin" });
});

test("second sign-up is blocked while registration is closed (default)", async () => {
  const { app } = testHarness();
  await signUp(app, "First", "first@example.com");

  const res = await signUp(app, "Second", "second@example.com");
  expect(res.status).toBe(403);
});

// NOTE: trustedOrigins (the Vite-dev-origin fix in auth/index.ts) has no unit
// test on purpose — Better Auth skips origin/CSRF enforcement entirely under
// test runners, so any assertion here passes vacuously. Verified manually
// against a development-mode server (where enforcement is active).

test("a valid trip-invite header opens the closed gate; an invalid one does not (PD-10)", async () => {
  const { app, sqlite } = testHarness({}, { isInviteTokenValid: (t) => t === "good-token" });
  await signUp(app, "First", "first@example.com");

  const bad = await signUp(app, "Crasher", "crasher@example.com", {
    "x-caravan-invite": "forged-token",
  });
  expect(bad.status).toBe(403);

  const good = await signUp(app, "Invitee", "invitee@example.com", {
    "x-caravan-invite": "good-token",
  });
  expect(good.status).toBe(200);
  const row = sqlite.prepare("select role from user where email = ?").get("invitee@example.com");
  expect(row).toEqual({ role: "member" }); // invited ≠ admin
});

test("admin can open registration; later users are plain members", async () => {
  const { app, db, sqlite } = testHarness();
  await signUp(app, "First", "first@example.com");

  setSetting(db, "registration_open", "true");
  const res = await signUp(app, "Second", "second@example.com");
  expect(res.status).toBe(200);

  const row = sqlite.prepare("select role from user where email = ?").get("second@example.com");
  expect(row).toEqual({ role: "member" });
});

test("sign-in returns a session for an existing user", async () => {
  const { app } = testHarness();
  await signUp(app, "Andrew", "andrew@example.com");

  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "andrew@example.com", password: "correct-horse-battery" }),
  });
  expect(res.status).toBe(200);

  const cookie = res.headers.get("set-cookie") ?? "";
  const session = await app.request("/api/auth/get-session", { headers: { cookie } });
  expect(session.status).toBe(200);
  const body = (await session.json()) as { user?: { email?: string } };
  expect(body.user?.email).toBe("andrew@example.com");
});

test("ADMIN_EMAIL/ADMIN_PASSWORD pre-seed creates the admin once", async () => {
  const { db, auth, config, sqlite } = testHarness({
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD: "a-long-admin-password",
  });

  await ensureAdminUser({ auth, db, config, logger: silentLogger });
  const row = sqlite.prepare("select role from user where email = ?").get("admin@example.com");
  expect(row).toEqual({ role: "admin" });

  // idempotent: a second boot doesn't try to create it again
  await expect(ensureAdminUser({ auth, db, config, logger: silentLogger })).resolves.not.toThrow();
  const n = sqlite.prepare("select count(*) as n from user").get() as { n: number };
  expect(n.n).toBe(1);
});

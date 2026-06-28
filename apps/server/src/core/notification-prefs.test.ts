import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createDb, schema } from "../db";
import { runMigrations } from "../db/migrate";
import { getDigestEnabled, getDigestOptedOut, setDigestEnabled } from "./notification-prefs";

const tempDirs: string[] = [];

function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-prefs-"));
  tempDirs.push(dir);
  const { db, sqlite } = createDb(path.join(dir, "test.db"));
  runMigrations(db);
  return { db, sqlite };
}

/** notification_prefs FKs to user (cascade), so a row needs a real user first. */
function seedUser(db: ReturnType<typeof tempDb>["db"], id: string) {
  const now = new Date();
  db.insert(schema.user)
    .values({ id, name: id, email: `${id}@example.com`, createdAt: now, updatedAt: now })
    .run();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("getDigestEnabled defaults to true when no row exists", () => {
  const { db } = tempDb();
  expect(getDigestEnabled(db, "nobody")).toBe(true);
});

test("setDigestEnabled upserts and getDigestEnabled reflects it", () => {
  const { db } = tempDb();
  seedUser(db, "u1");

  setDigestEnabled(db, "u1", false);
  expect(getDigestEnabled(db, "u1")).toBe(false);

  // Second write updates the same row (PK on user_id) rather than failing.
  setDigestEnabled(db, "u1", true);
  expect(getDigestEnabled(db, "u1")).toBe(true);
});

test("getDigestOptedOut returns only opted-out users (bulk, same default as getDigestEnabled)", () => {
  const { db } = tempDb();
  seedUser(db, "out1");
  seedUser(db, "out2");
  seedUser(db, "in1");

  // Empty until someone explicitly opts out — a missing row defaults to enabled.
  expect(getDigestOptedOut(db).size).toBe(0);

  setDigestEnabled(db, "out1", false);
  setDigestEnabled(db, "out2", false);
  setDigestEnabled(db, "in1", true); // an explicit opt-IN row must NOT appear

  const optedOut = getDigestOptedOut(db);
  expect(optedOut.has("out1")).toBe(true);
  expect(optedOut.has("out2")).toBe(true);
  expect(optedOut.has("in1")).toBe(false);
  // A user with no row at all is enabled by default, so absent from the set.
  expect(optedOut.has("nobody")).toBe(false);
  expect(optedOut.size).toBe(2);
});

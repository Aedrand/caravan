import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createDb, schema } from "../db";
import { runMigrations } from "../db/migrate";
import { getDigestEnabled, setDigestEnabled } from "./notification-prefs";

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

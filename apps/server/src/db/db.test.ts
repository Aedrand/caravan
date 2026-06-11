import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createDb } from "./index";
import { runMigrations } from "./migrate";

const tempDirs: string[] = [];

function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-db-"));
  tempDirs.push(dir);
  return createDb(path.join(dir, "test.db"));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("boot pragmas are applied", () => {
  const { sqlite } = tempDb();
  expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
  expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
});

test("migrations create the schema", () => {
  const { db, sqlite } = tempDb();
  runMigrations(db);
  const tables = sqlite
    .prepare("select name from sqlite_master where type = 'table'")
    .all()
    .map((row) => (row as { name: string }).name);
  expect(tables).toEqual(expect.arrayContaining(["instance_settings", "trips"]));
});

test("migrations fail fast on a missing folder", () => {
  const { db } = tempDb();
  expect(() => runMigrations(db, "/nonexistent/migrations")).toThrow();
});

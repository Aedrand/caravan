import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadConfig } from "./config";

const tempDirs: string[] = [];

function tempDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("zero-env boot: defaults apply and a secret key is generated + persisted", () => {
  const dataDir = tempDataDir();
  const config = loadConfig({ DATA_DIR: dataDir });

  expect(config.port).toBe(3000);
  expect(config.baseUrl).toBe("http://localhost:3000");
  expect(config.dbPath).toBe(path.join(dataDir, "caravan.db"));
  expect(config.secretKey.length).toBeGreaterThanOrEqual(32);
  expect(readFileSync(path.join(dataDir, "secret_key"), "utf8").trim()).toBe(config.secretKey);
});

test("second boot reuses the persisted secret key", () => {
  const dataDir = tempDataDir();
  const first = loadConfig({ DATA_DIR: dataDir });
  const second = loadConfig({ DATA_DIR: dataDir });
  expect(second.secretKey).toBe(first.secretKey);
});

test("explicit SECRET_KEY wins over the generated file", () => {
  const dataDir = tempDataDir();
  const key = "k".repeat(40);
  const config = loadConfig({ DATA_DIR: dataDir, SECRET_KEY: key });
  expect(config.secretKey).toBe(key);
});

test("invalid env fails fast with a readable error", () => {
  expect(() => loadConfig({ DATA_DIR: tempDataDir(), PORT: "not-a-port" })).toThrow();
});

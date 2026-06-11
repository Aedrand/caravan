import pino from "pino";
import { afterEach, expect, test, vi } from "vitest";
import { createJobRegistry } from "./jobs";

const silentLogger = pino({ level: "silent" });
let registry: ReturnType<typeof createJobRegistry> | undefined;

afterEach(() => {
  registry?.stop();
  registry = undefined;
});

test("registers, lists, and manually triggers a job", async () => {
  registry = createJobRegistry(silentLogger);
  const fn = vi.fn();
  const job = registry.register("test-job", "0 0 * * *", fn);

  expect(registry.list()).toEqual(["test-job"]);
  await job.trigger();
  expect(fn).toHaveBeenCalledOnce();
});

test("rejects duplicate job names", () => {
  registry = createJobRegistry(silentLogger);
  registry.register("dupe", "0 0 * * *", () => {});
  expect(() => registry?.register("dupe", "0 0 * * *", () => {})).toThrow(/already registered/);
});

test("stop clears all jobs", () => {
  registry = createJobRegistry(silentLogger);
  registry.register("a", "0 0 * * *", () => {});
  registry.register("b", "0 0 * * *", () => {});
  registry.stop();
  expect(registry.list()).toEqual([]);
});

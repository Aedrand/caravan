import { expect, test } from "vitest";
import { createId, ID_PATTERN } from "./id";

test("createId produces 32 lowercase hex chars", () => {
  expect(createId()).toMatch(ID_PATTERN);
});

test("createId does not collide across 10k draws", () => {
  const ids = new Set(Array.from({ length: 10_000 }, createId));
  expect(ids.size).toBe(10_000);
});

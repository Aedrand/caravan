import { expect, test } from "vitest";
import { app } from "./app";

test("GET /health returns ok", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", service: "caravan" });
});

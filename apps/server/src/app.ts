import { Hono } from "hono";

/**
 * The Hono app, separated from the listener so tests can call
 * `app.request()` directly and so the `hc` client type can be exported
 * later (M0.5) without importing server-only modules.
 */
export const app = new Hono().get("/health", (c) => c.json({ status: "ok", service: "caravan" }));

export type AppType = typeof app;

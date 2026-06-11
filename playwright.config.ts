import { defineConfig, devices } from "@playwright/test";

/**
 * M0 walking-skeleton E2E: drives the REAL production stack — the built Hono
 * server serving the built SPA from apps/web/dist.
 *
 * Prerequisite: run `pnpm build` first (this config builds nothing itself).
 *
 * Each run gets a brand-new temp DATA_DIR (`mktemp -d` in the webServer
 * command — POSIX-only by design; CI is Linux, dev is macOS), so the database
 * starts empty and the first registration is the instance bootstrap.
 * 127.0.0.1 is used over localhost so the browser origin always matches
 * BASE_URL (Better Auth rejects POSTs from untrusted origins).
 */
const PORT = 3456;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // The spec's tests share the server's database state and run serially.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // cwd apps/server is the server's documented run contract: it resolves
    // its drizzle/ migrations and the WEB_DIST default (../web/dist) from cwd.
    command: 'DATA_DIR="$(mktemp -d)" node dist/index.js',
    cwd: "apps/server",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "production",
      PORT: String(PORT),
      BASE_URL: baseURL,
    },
  },
});

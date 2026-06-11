import { expect, test } from "@playwright/test";

/**
 * M0 exit test (PROJECT.md walking skeleton): a fresh instance can register
 * its first user (the bootstrap admin), see the dashboard, sign out, and sign
 * back in — all against the built server + built SPA.
 *
 * Serial on purpose: both tests share one server/database. The first test
 * creates the instance's only user (registration is invite-only afterwards),
 * and the second signs in as that same user from a fresh browser context.
 */
test.describe.configure({ mode: "serial" });

const user = {
  name: "Avery Trailhead",
  email: "avery@example.com",
  password: "wander-far-and-wide",
};

test("walking skeleton: register, land on dashboard, see the user menu", async ({ page }) => {
  // Unauthenticated visitors are bounced from the dashboard to /login.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  // Cross-link to registration.
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "Join the caravan" })).toBeVisible();

  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  // First sign-up on a fresh database succeeds and lands on the dashboard.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "No trips yet" })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(user.name);
});

test("signing out returns to login; signing back in works", async ({ page }) => {
  // Fresh browser context — sign in as the user registered above.
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "No trips yet" })).toBeVisible();

  // Signed-in users don't see the auth pages.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  // …and back in.
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "No trips yet" })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(user.name);
});

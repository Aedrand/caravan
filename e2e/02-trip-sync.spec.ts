import { expect, type Page, test } from "@playwright/test";

/**
 * M1 serial-foundation exit canary (a slice of the full TD-9 gate, task 1.11):
 * two browser contexts share a trip; a rename and an archive made in one
 * appear live in the other over the WS sync path — no reloads.
 *
 * Runs after 01-walking-skeleton, which registered the instance's only user —
 * registration is invite-only afterwards and invite links land in M1.5, so
 * both contexts sign in as the same member for now. The full two-browser,
 * two-member matrix arrives with 1.11.
 */
test.describe.configure({ mode: "serial" });

const user = { email: "avery@example.com", password: "wander-far-and-wide" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("create a trip; rename and archive propagate live to a second browser", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // A creates the instance's first trip through the dialog.
  await signIn(a);
  await a.getByRole("button", { name: "Plan your first trip" }).click();
  await a.getByLabel("Name", { exact: true }).fill("Lisbon Getaway");
  await a.getByLabel("Destination (optional)").fill("Lisbon, Portugal");
  await a.getByLabel("Start date").fill("2026-09-04");
  await a.getByLabel("End date").fill("2026-09-09");
  await a.getByRole("button", { name: "Create trip" }).click();
  await expect(a).toHaveURL(/\/trips\/[0-9a-f]{32}$/);
  await expect(a.getByRole("heading", { name: "Lisbon Getaway" })).toBeVisible();
  await expect(a.getByText("Live")).toBeVisible();

  // B opens the same trip in a separate browser context (own session cookie).
  await signIn(b);
  await b.goto(a.url());
  await expect(b.getByRole("heading", { name: "Lisbon Getaway" })).toBeVisible();
  await expect(b.getByText("Live")).toBeVisible();

  // Rename in A → arrives in B over the socket.
  await a.getByRole("button", { name: "Rename trip" }).click();
  await a.getByLabel("Trip name").fill("Lisbon, but slower");
  await a.getByLabel("Trip name").press("Enter");
  await expect(a.getByRole("heading", { name: "Lisbon, but slower" })).toBeVisible();
  await expect(b.getByRole("heading", { name: "Lisbon, but slower" })).toBeVisible({
    timeout: 10_000,
  });

  // Archive in A → B shows the read-only banner live.
  await a.getByRole("button", { name: "Trip actions" }).click();
  await a.getByRole("menuitem", { name: "Archive" }).click();
  await expect(a.getByText("This trip is archived — read-only.")).toBeVisible();
  await expect(b.getByText("This trip is archived — read-only.")).toBeVisible({
    timeout: 10_000,
  });

  // The dashboard reflects the archived state too.
  await a.getByRole("link", { name: "Back to your trips" }).click();
  await expect(a.getByRole("heading", { name: "Your trips" })).toBeVisible();
  await expect(a.getByText("Archived", { exact: true })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

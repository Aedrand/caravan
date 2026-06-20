import { expect, type Page, test } from "@playwright/test";

/**
 * M1.5 exit canary: the full invite loop with TWO REAL USERS. The owner mints
 * a role-carrying link; a stranger registers THROUGH it on an invite-only
 * instance, lands in the trip, and edits flow live in both directions.
 * (Runs after 01/02: avery exists; their Lisbon trip is archived.)
 */
test.describe.configure({ mode: "serial" });

const owner = { email: "avery@example.com", password: "wander-far-and-wide" };
const invitee = { name: "Bela Wanderer", email: "bela@example.com", password: "tag-along-train" };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("invite link: stranger registers through it and collaborates live", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // Owner: fresh trip + invite link.
  await signIn(a, owner.email, owner.password);
  await a.getByRole("button", { name: "New trip" }).click();
  await a.getByLabel("Name", { exact: true }).fill("Porto Crew");
  await a.getByRole("button", { name: "Create trip" }).click();
  await expect(a).toHaveURL(/\/trips\/[0-9a-f]{32}$/);
  await expect(a.getByText("Live")).toBeVisible();

  // Members live in the Group view now (C.4 workspace IA).
  await a.getByRole("button", { name: "Group", exact: true }).click();
  const members = a.getByRole("region", { name: "Members" });
  await members.getByRole("button", { name: "Create invite link" }).click();
  const inviteUrl = await members.getByRole("textbox", { name: "Invite link" }).inputValue();
  expect(inviteUrl).toMatch(/\/join\/[A-Za-z0-9_-]{20,}$/);

  // Stranger: the link is the registration door (instance is invite-only).
  await b.goto(inviteUrl);
  await expect(b.getByRole("heading", { name: "Join Porto Crew" })).toBeVisible();
  await b.getByLabel("Name").fill(invitee.name);
  await b.getByLabel("Email").fill(invitee.email);
  await b.getByLabel("Password").fill(invitee.password);
  await b.getByRole("button", { name: "Create account" }).click();

  // …straight into the trip as an editor.
  await expect(b).toHaveURL(/\/trips\/[0-9a-f]{32}$/, { timeout: 10_000 });
  await expect(b.getByRole("heading", { name: "Porto Crew" })).toBeVisible();
  await expect(b.getByText("Live")).toBeVisible();

  // The owner watches the join land live (member.join over WS).
  await expect(members.getByText(invitee.name)).toBeVisible({ timeout: 10_000 });

  // Editor renames; the owner sees it without reloading.
  await b.getByRole("button", { name: "Rename trip" }).click();
  await b.getByLabel("Trip name").fill("Porto Crew Rides Again");
  await b.getByLabel("Trip name").press("Enter");
  await expect(a.getByRole("heading", { name: "Porto Crew Rides Again" })).toBeVisible({
    timeout: 10_000,
  });

  // And the reverse direction still holds (owner → editor).
  await a.getByRole("button", { name: "Rename trip" }).click();
  await a.getByLabel("Trip name").fill("Porto Crew Forever");
  await a.getByLabel("Trip name").press("Enter");
  await expect(b.getByRole("heading", { name: "Porto Crew Forever" })).toBeVisible({
    timeout: 10_000,
  });

  await ctxA.close();
  await ctxB.close();
});

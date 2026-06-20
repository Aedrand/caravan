import { type BrowserContext, expect, type Page, test } from "@playwright/test";

/**
 * M1 exit gate (TD-9, task 1.11): the product's core promise under two real
 * members in two browsers. Owner Avery and editor Bela (both registered in
 * 01–03) share a fresh dated trip; itinerary edits, presence, editing hints,
 * the attributed feed, move convergence, and offline catch-up all hold live.
 *
 * Scope note: same-field last-write-wins (②) and optimistic rollback on a
 * rejected mutation (⑦) are covered deterministically by unit/integration
 * tests (apply.test.ts, sync.test.ts); here we prove the multi-browser path.
 */
test.describe.configure({ mode: "serial" });

const owner = {
  name: "Avery Trailhead",
  email: "avery@example.com",
  password: "wander-far-and-wide",
};
const editor = { name: "Bela Wanderer", email: "bela@example.com", password: "tag-along-train" };

const DAY_1 = "2026-10-01";
const DAY_2 = "2026-10-02";
const LIVE = 10_000;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function addActivity(page: Page, title: string, dayValue?: string) {
  await page.getByRole("button", { name: "Add activity" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an activity" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill(title);
  if (dayValue) await dialog.getByLabel("Day").selectOption(dayValue);
  await dialog.getByRole("button", { name: "Add to trip" }).click();
  await expect(dialog).toBeHidden();
}

async function openEdit(page: Page, title: string) {
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit activity" })).toBeVisible();
}

// The feed is a bell-triggered modal drawer now (C.4 workspace IA): open it,
// read the attributed rows, then dismiss so it stops covering the itinerary.
async function expectFeed(page: Page, ...lines: string[]) {
  await page.getByRole("button", { name: "What changed" }).click();
  for (const line of lines) {
    await expect(page.getByText(line)).toBeVisible({ timeout: LIVE });
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "What changed" })).toBeHidden();
}

test("two members, two browsers: edits, presence, feed, convergence, catch-up", async ({
  browser,
}) => {
  const ctxA: BrowserContext = await browser.newContext();
  const ctxB: BrowserContext = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // Owner spins up a dated trip and mints an invite link.
  await signIn(a, owner.email, owner.password);
  await a.getByRole("button", { name: "New trip" }).click();
  await a.getByLabel("Name", { exact: true }).fill("Sync Gate");
  await a.getByLabel("Start date").fill(DAY_1);
  await a.getByLabel("End date").fill(DAY_2);
  await a.getByRole("button", { name: "Create trip" }).click();
  await expect(a).toHaveURL(/\/trips\/[0-9a-f]{32}$/);
  await expect(a.getByText("Live")).toBeVisible();

  // Members live in the Group view now (C.4 workspace IA).
  await a.getByRole("button", { name: "Group" }).click();
  const members = a.getByRole("region", { name: "Members" });
  await members.getByRole("button", { name: "Create invite link" }).click();
  const inviteUrl = await members.getByRole("textbox", { name: "Invite link" }).inputValue();
  // Back to Plan for the itinerary work below.
  await a.getByRole("button", { name: "Plan" }).click();

  // Editor (already has an account) accepts the invite and lands in the trip.
  await signIn(b, editor.email, editor.password);
  await b.goto(inviteUrl);
  await b.getByRole("button", { name: "Join trip" }).click();
  await expect(b).toHaveURL(/\/trips\/[0-9a-f]{32}$/, { timeout: LIVE });
  await expect(b.getByRole("heading", { name: "Sync Gate" })).toBeVisible();

  // ④ Presence: each browser shows both people here now.
  await expect(a.getByLabel("2 people here now")).toBeVisible({ timeout: LIVE });
  await expect(b.getByLabel("2 people here now")).toBeVisible({ timeout: LIVE });

  // ① Concurrent independent adds both persist and cross over live.
  await addActivity(a, "Castle tour"); // defaults to Day 1
  await addActivity(b, "Harbor dinner", DAY_2);
  await expect(a.getByRole("heading", { name: "Harbor dinner" })).toBeVisible({ timeout: LIVE });
  await expect(b.getByRole("heading", { name: "Castle tour" })).toBeVisible({ timeout: LIVE });

  // ⑤ Feed attributes both actors (open B's feed drawer, read, dismiss).
  await expectFeed(b, "Avery Trailhead added Castle tour", "Bela Wanderer added Harbor dinner");

  // ④ Editing hint: A opens the editor on Castle tour → B sees the live hint,
  // which clears when A backs out.
  await openEdit(a, "Castle tour");
  await expect(b.getByText(/Avery Trailhead is editing/)).toBeVisible({ timeout: LIVE });
  await a
    .getByRole("dialog", { name: "Edit activity" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(b.getByText(/Avery Trailhead is editing/)).toBeHidden({ timeout: LIVE });

  // ③ Move convergence: A reschedules Harbor dinner to Day 1 (activity.move);
  // B's live feed records the converged move.
  await openEdit(a, "Harbor dinner");
  const edit = a.getByRole("dialog", { name: "Edit activity" });
  await edit.getByLabel("Day").selectOption(DAY_1);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  await expectFeed(b, "Avery Trailhead moved Harbor dinner");

  // ⑥ Offline catch-up: B drops the network, A adds while B is dark, B comes
  // back and the reconnect replays the missed state.
  await ctxB.setOffline(true);
  await addActivity(a, "Late addition"); // Day 1
  await ctxB.setOffline(false);
  await expect(b.getByRole("heading", { name: "Late addition" })).toBeVisible({ timeout: 20_000 });

  await ctxA.close();
  await ctxB.close();
});

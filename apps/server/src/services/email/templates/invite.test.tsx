import { expect, test } from "vitest";
import { renderEmail } from "../index";
import { InviteEmail } from "./invite";
import { OwnershipTransferEmail } from "./ownership-transfer";

test("InviteEmail renders the trip, inviter, role, and join link", async () => {
  const joinUrl = "https://caravan.example/join/tok_abc123";
  const { html, text } = await renderEmail(
    <InviteEmail
      tripName="Patagonia 2026"
      inviterName="Ada"
      inviteRole="editor"
      joinUrl={joinUrl}
    />,
  );

  // Shared chrome + the invite specifics all land in the HTML.
  expect(html).toContain("Caravan");
  expect(html).toContain("Patagonia 2026");
  expect(html).toContain("Ada");
  expect(html).toContain("editor");
  expect(html).toContain(joinUrl);

  // Plain-text fallback keeps the link usable in clients that strip HTML.
  expect(text).toContain("Patagonia 2026");
  expect(text).toContain(joinUrl);
  expect(text).not.toContain("<html");
});

test("OwnershipTransferEmail renders the trip, both owners, and the trip link", async () => {
  const tripUrl = "https://caravan.example/trips/trip_42";
  const { html, text } = await renderEmail(
    <OwnershipTransferEmail
      tripName="Patagonia 2026"
      newOwnerName="Grace"
      previousOwnerName="Ada"
      tripUrl={tripUrl}
    />,
  );

  expect(html).toContain("Patagonia 2026");
  expect(html).toContain("Grace");
  expect(html).toContain("Ada");
  expect(html).toContain(tripUrl);

  expect(text).toContain("Patagonia 2026");
  expect(text).toContain(tripUrl);
});

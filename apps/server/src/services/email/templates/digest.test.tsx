import { expect, test } from "vitest";
import { renderEmail } from "../index";
import { DigestEmail } from "./digest";

test("DigestEmail renders the trip name, activity lines, and a trip link", async () => {
  const { html, text } = await renderEmail(
    DigestEmail({
      tripName: "Iceland Ring Road",
      lines: ["Alex added Blue Lagoon", "Sam commented on Day 2"],
      tripUrl: "https://caravan.example.com/trips/trip-123",
    }),
  );

  // Trip name and each activity line make it into the HTML…
  expect(html).toContain("Iceland Ring Road");
  expect(html).toContain("Alex added Blue Lagoon");
  expect(html).toContain("Sam commented on Day 2");
  // …the View trip button links to the trip…
  expect(html).toContain("https://caravan.example.com/trips/trip-123");
  expect(html).toContain("View trip");
  // …and the shared layout chrome is present.
  expect(html).toContain("Caravan");

  // Plain-text fallback carries the readable copy (the heading renders
  // upper-cased in plain text, so compare case-insensitively).
  expect(text.toLowerCase()).toContain("iceland ring road");
  expect(text).toContain("Alex added Blue Lagoon");
});

test("DigestEmail summary line is singular for one update", async () => {
  const { html } = await renderEmail(
    DigestEmail({
      tripName: "Weekend in Porto",
      lines: ["Jordan added Port tasting"],
      tripUrl: "https://caravan.example.com/trips/t1",
    }),
  );
  expect(html).toContain("1 thing changed");
});

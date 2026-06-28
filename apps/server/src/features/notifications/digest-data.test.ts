import type { FeedEvent } from "@caravan/shared";
import { expect, test } from "vitest";
import { type DigestEvent, describeEvent, summarizeLine } from "./digest-data";

/**
 * Copy tests for the digest summarizer (D.2). describeEvent returns the verb
 * phrase only; summarizeLine prefixes the actor name. The wording mirrors the
 * in-app feed (web feed-panel `describe`) so the email reads the same.
 */

/** Minimal FeedEvent for copy assertions — only type + payload matter here. */
function event(type: string, payload: Record<string, unknown> = {}): FeedEvent {
  return {
    id: "evt",
    tripId: "trip",
    version: 1,
    actorType: "user",
    actorMemberId: "m1",
    type,
    entityType: "member",
    entityId: "e1",
    payload,
    createdAt: Date.now(),
  };
}

const line = (type: string, payload: Record<string, unknown> = {}, actor = "Alex") =>
  summarizeLine({
    event: event(type, payload),
    actorMemberId: "m1",
    actorName: actor,
  } as DigestEvent);

test("membership events read naturally and aren't the vague fallback", () => {
  // The reported bug: member.join used to fall through to "made a change".
  expect(describeEvent(event("member.join", { name: "Alex", role: "editor" }))).toBe(
    "joined the trip",
  );
  expect(line("member.join", { name: "Alex", role: "editor" })).toBe("Alex joined the trip");

  // member.leave is a verb phrase only — the actor isn't doubled in the line.
  expect(describeEvent(event("member.leave", { name: "Alex" }))).toBe("left the trip");
  expect(line("member.leave", { name: "Alex" })).toBe("Alex left the trip");

  // remove / setRole name the *target*, so the prefixed line stays correct.
  expect(line("member.remove", { name: "Sam" })).toBe("Alex removed Sam");
  expect(line("member.setRole", { name: "Sam", role: "viewer" })).toBe(
    "Alex changed Sam's role to viewer",
  );

  // ownership transfer + invite create keep their existing, natural copy.
  expect(line("trip.transferOwnership", { toName: "Sam" })).toBe(
    "Alex handed off ownership to Sam",
  );
  expect(line("invite.create")).toBe("Alex created an invite link");
});

test("a known activity/expense event still summarizes, and unknown types fall back safely", () => {
  expect(line("activity.create", { title: "Lunch" })).toBe("Alex added Lunch");
  expect(line("expense.create", { description: "Hotel" })).toBe("Alex added the expense Hotel");
  // Anything unmapped degrades to the safe generic phrase rather than throwing.
  expect(describeEvent(event("some.future.event"))).toBe("made a change");
});

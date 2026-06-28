import type { FeedEvent } from "@caravan/shared";
import { asc, eq, gte } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";

/**
 * Read + summarize helpers for the daily digest (D.2). Kept out of
 * core/mutations.ts on purpose: the feed/sync log is version-cursored, but a
 * *daily* digest wants a wall-clock window (events from the last 24h by
 * createdAt), so the time-bounded read lives here next to its only caller.
 */

/** Default digest window: events from the trailing 24 hours. */
export const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A feed event paired with the actor's display name, ready to summarize. */
export interface DigestEvent {
  event: FeedEvent;
  /** Membership id of the actor (null for actorless/system events). */
  actorMemberId: string | null;
  /** Human name behind the action; "Scout" for AI actors, "Someone" if unknown. */
  actorName: string;
}

function rowToEvent(row: typeof schema.feedEvents.$inferSelect): FeedEvent {
  return { ...row, payload: JSON.parse(row.payload) as unknown };
}

/**
 * All feed events created at/after `since`, grouped by trip and joined to the
 * actor's name — one pass over feed_events for the whole instance (no per-trip
 * query, no N+1 on member/user lookups). Oldest-first within each trip so the
 * digest reads chronologically. Trips with no recent activity simply don't
 * appear as keys.
 */
export function recentEventsByTrip(db: Db, since: number): Map<string, DigestEvent[]> {
  const rows = db
    .select({
      event: schema.feedEvents,
      actorName: schema.user.name,
    })
    .from(schema.feedEvents)
    // Left join: actorless/system events (actorMemberId null) still come through.
    .leftJoin(schema.tripMembers, eq(schema.tripMembers.id, schema.feedEvents.actorMemberId))
    .leftJoin(schema.user, eq(schema.user.id, schema.tripMembers.userId))
    .where(gte(schema.feedEvents.createdAt, since))
    .orderBy(asc(schema.feedEvents.createdAt))
    .all();

  const byTrip = new Map<string, DigestEvent[]>();
  for (const row of rows) {
    const event = rowToEvent(row.event);
    const actorName = event.actorType !== "user" ? "Scout" : (row.actorName ?? "Someone");
    const list = byTrip.get(event.tripId);
    const entry: DigestEvent = { event, actorMemberId: event.actorMemberId, actorName };
    if (list) list.push(entry);
    else byTrip.set(event.tripId, [entry]);
  }
  return byTrip;
}

/**
 * The verb phrase for one event, derived from its type + payload snapshot.
 * Mirrors the in-app feed's copy (web feed-panel `describe`) so the email reads
 * the same as the activity drawer. Payloads are loose (`unknown` on the wire),
 * so every field access is defensive.
 */
export function describeEvent(event: FeedEvent): string {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const str = (k: string, fallback: string) =>
    typeof p[k] === "string" ? (p[k] as string) : fallback;
  const title = str("title", "an activity");

  switch (event.type) {
    case "activity.create":
      return `added ${title}`;
    case "activity.update":
      return `edited ${title}`;
    case "activity.move":
      return `moved ${title}`;
    case "activity.delete":
      return `removed ${title}`;
    case "trip.update":
      return "updated the trip details";
    case "trip.archive":
      return "archived the trip";
    case "trip.unarchive":
      return "reopened the trip";
    case "trip.transferOwnership":
      return `handed off ownership to ${str("toName", "someone")}`;
    case "member.leave":
      return `${str("name", "Someone")} left the trip`;
    case "member.remove":
      return `removed ${str("name", "a member")}`;
    case "member.setRole":
      return `made ${str("name", "a member")} ${str("role", "a different role")}`;
    case "invite.create":
      return "created an invite link";
    case "invite.revoke":
      return "revoked an invite link";
    case "vote.toggle":
      return p.on === false
        ? `removed their vote on ${str("activityTitle", "an activity")}`
        : `voted for ${str("activityTitle", "an activity")}`;
    case "comment.create":
      return `commented on ${str("targetTitle", p.targetType === "poll" ? "a poll" : "an activity")}`;
    case "comment.update":
      return `edited a comment on ${str("targetTitle", p.targetType === "poll" ? "a poll" : "an activity")}`;
    case "comment.delete":
      return `deleted a comment on ${str("targetTitle", p.targetType === "poll" ? "a poll" : "an activity")}`;
    case "poll.create":
      return `opened the poll “${str("question", "a poll")}”`;
    case "poll.addOption":
      return `added an option to “${str("question", "a poll")}”`;
    case "poll.vote":
      return `voted in “${str("question", "a poll")}”`;
    case "poll.close":
      return `closed the poll “${str("question", "a poll")}”`;
    case "poll.convert":
      return `turned “${str("question", "a poll")}” into the idea ${str("activityTitle", "an activity")}`;
    case "expense.create":
      return `added the expense ${str("description", "an expense")}`;
    case "expense.update":
      return `edited the expense ${str("description", "an expense")}`;
    case "expense.delete":
      return `removed the expense ${str("description", "an expense")}`;
    case "payment.create":
      return `recorded a payment from ${str("fromName", "someone")} to ${str("toName", "someone")}`;
    case "payment.delete":
      return `removed a payment from ${str("fromName", "someone")} to ${str("toName", "someone")}`;
    default:
      return "made a change";
  }
}

/** "Alex added Lunch at X" — the actor's name + the verb phrase, one line. */
export function summarizeLine(item: DigestEvent): string {
  return `${item.actorName} ${describeEvent(item.event)}`;
}

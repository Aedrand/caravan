import type { FeedEvent, TripMember } from "@caravan/shared";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FALLBACK_PERSON_COLOR, personColors } from "@/lib/person-colors";
import { relativeTime } from "@/lib/relative-time";
import { useFeed, useMarkSeen, useSeen } from "@/lib/sync";

/** The verb phrase for a feed line, keyed on mutation type (payloads are summaries). */
function describe(event: FeedEvent): string {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const title = typeof p.title === "string" ? p.title : "an activity";
  const str = (k: string, fallback: string) =>
    typeof p[k] === "string" ? (p[k] as string) : fallback;
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
      return "handed off ownership";
    case "member.leave":
      return "left the trip";
    case "member.remove":
      return "removed a member";
    case "member.setRole":
      return "changed a member's role";
    case "invite.create":
      return "created an invite link";
    case "invite.revoke":
      return "revoked an invite link";
    // --- Track A: votes / comments / polls ---
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
    case "expense.create": {
      const desc = typeof p.description === "string" ? p.description : "an expense";
      return `added the expense ${desc}`;
    }
    case "expense.update": {
      const desc = typeof p.description === "string" ? p.description : "an expense";
      return `edited the expense ${desc}`;
    }
    case "expense.delete": {
      const desc = typeof p.description === "string" ? p.description : "an expense";
      return `removed the expense ${desc}`;
    }
    case "payment.create":
    case "payment.delete": {
      const from = typeof p.fromName === "string" ? p.fromName : "someone";
      const to = typeof p.toName === "string" ? p.toName : "someone";
      const verb = event.type === "payment.create" ? "recorded" : "removed";
      return `${verb} a payment from ${from} to ${to}`;
    }
    default:
      return "made a change";
  }
}

export function FeedPanel({ tripId, members }: { tripId: string; members: TripMember[] }) {
  const feedQuery = useFeed(tripId);
  const seenQuery = useSeen(tripId);
  const markSeen = useMarkSeen(tripId);

  // Frozen at open so the divider doesn't jump as we mark things seen.
  const [seenAtOpen, setSeenAtOpen] = useState(0);
  // The drawer mounts a fresh FeedPanel each time it opens, so there's no toggle
  // to snapshot `seen` at; freeze it once the seen query first resolves instead.
  const frozenRef = useRef(false);

  const events = feedQuery.data?.events ?? [];
  const hasMore = feedQuery.data?.hasMore ?? false;
  const seen = seenQuery.data?.version ?? 0;
  const latestVersion = events[0]?.version ?? 0;

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const colors = useMemo(
    () =>
      personColors(
        members.filter((m) => m.status === "active").sort((a, b) => a.joinedAt - b.joinedAt),
      ),
    [members],
  );

  // On drawer open: snapshot `seen` once it has resolved so the "caught up to
  // here" divider has a stable boundary, then let the effect below advance the
  // cursor (which clears the bell badge).
  useEffect(() => {
    if (frozenRef.current || !seenQuery.isSuccess) return;
    frozenRef.current = true;
    setSeenAtOpen(seen);
  }, [seenQuery.isSuccess, seen]);

  // While the feed is open, keep the cursor at the newest event we've shown.
  useEffect(() => {
    if (latestVersion > seen) markSeen(latestVersion);
  }, [latestVersion, seen, markSeen]);

  // First-load (no cached page yet) shows a skeleton; a load failure shows an
  // inline alert with retry. Both are small in-drawer states, so they stay
  // lightweight rather than using the full-surface primitives.
  if (feedQuery.isPending) {
    // The skeleton itself is aria-hidden, so pair it with a polite status line
    // (visually hidden) and mark the region busy so AT announces the load.
    return (
      <div aria-busy="true">
        <p role="status" className="sr-only">
          Loading recent activity…
        </p>
        <FeedSkeleton />
      </div>
    );
  }
  if (feedQuery.isError) {
    return (
      <div className="py-3">
        <p role="alert" className="text-sm text-destructive">
          Couldn't load recent activity.
        </p>
        <button
          type="button"
          onClick={() => void feedQuery.refetch()}
          className="mt-2 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Try again
        </button>
      </div>
    );
  }

  const body =
    events.length === 0 ? (
      <p className="py-3 text-sm text-muted-foreground">
        Nothing's happened yet — changes show up here as the group plans.
      </p>
    ) : (
      // aria-live: while the drawer is open, events appended by the socket are
      // announced. aria-relevant="additions" keeps it to *newly* prepended nodes
      // so existing items aren't re-read. The label gives SR users a handle.
      <ul
        aria-label="Activity feed"
        aria-live="polite"
        aria-relevant="additions"
        className="flex flex-col"
      >
        {events.map((event, i) => {
          const prev = events[i - 1];
          const showDivider =
            prev !== undefined && prev.version > seenAtOpen && event.version <= seenAtOpen;
          const member = event.actorMemberId ? memberById.get(event.actorMemberId) : undefined;
          const name = event.actorType !== "user" ? "Scout" : (member?.name ?? "Someone");
          const color = member
            ? (colors.get(member.id) ?? FALLBACK_PERSON_COLOR)
            : "var(--ink-soft)";
          return (
            <Fragment key={event.id}>
              {showDivider && (
                <li
                  aria-hidden
                  className="flex items-center gap-2.5 py-2 font-body font-bold text-[11px] text-muted-foreground uppercase tracking-wide"
                >
                  <span className="flex-1 border-border border-t-2 border-dotted" />
                  Caught up to here
                  <span className="flex-1 border-border border-t-2 border-dotted" />
                </li>
              )}
              <li className="flex items-start gap-2.5 py-2">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white"
                  style={{ backgroundColor: color }}
                >
                  {name.trim().charAt(0) || "?"}
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug">
                    <span className="font-semibold">{name}</span> {describe(event)}
                    {event.actorType !== "user" && (
                      <span aria-hidden className="ml-1 text-[var(--accent-strong)]">
                        ✦
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{relativeTime(event.createdAt)}</p>
                </div>
              </li>
            </Fragment>
          );
        })}
        {hasMore && (
          <li className="py-2 text-center text-xs text-muted-foreground">
            Earlier activity isn't shown here.
          </li>
        )}
      </ul>
    );

  // Rows only — the drawer owns the header and scroll.
  return body;
}

/** Loading placeholder that echoes the feed-row layout (avatar + two lines). */
function FeedSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-2.5 py-2">
          <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

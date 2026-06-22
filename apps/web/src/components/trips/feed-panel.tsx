import type { FeedEvent, TripMember } from "@caravan/shared";
import { ChevronDown } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_PERSON_COLOR, personColors } from "@/lib/person-colors";
import { relativeTime } from "@/lib/relative-time";
import { useFeed, useMarkSeen, useSeen, useUnreadCount } from "@/lib/sync";
import { cn } from "@/lib/utils";

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

export function FeedPanel({
  tripId,
  members,
  embedded = false,
}: {
  tripId: string;
  members: TripMember[];
  // Drawer mode (C.4): always-open rows, no collapsible card chrome — the
  // workspace's feed drawer supplies the "What changed" header around it.
  embedded?: boolean;
}) {
  const feedQuery = useFeed(tripId);
  const seenQuery = useSeen(tripId);
  const markSeen = useMarkSeen(tripId);
  const unread = useUnreadCount(tripId);

  const [expandedState, setExpanded] = useState(false);
  const expanded = embedded || expandedState;
  // Frozen at open so the divider doesn't jump as we mark things seen.
  const [seenAtOpen, setSeenAtOpen] = useState(0);
  // Embedded mode mounts fresh each time the drawer opens, so there's no toggle
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

  // Embedded (drawer) open: snapshot `seen` once it has resolved so the
  // "caught up to here" divider has a stable boundary, then let the effect
  // below advance the cursor (which clears the bell badge).
  useEffect(() => {
    if (!embedded || frozenRef.current || !seenQuery.isSuccess) return;
    frozenRef.current = true;
    setSeenAtOpen(seen);
  }, [embedded, seenQuery.isSuccess, seen]);

  // While the feed is open, keep the cursor at the newest event we've shown.
  useEffect(() => {
    if (expanded && latestVersion > seen) markSeen(latestVersion);
  }, [expanded, latestVersion, seen, markSeen]);

  function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setSeenAtOpen(seen);
    setExpanded(true);
    if (latestVersion > seen) markSeen(latestVersion);
  }

  const body =
    events.length === 0 ? (
      <p className="py-3 text-sm text-muted-foreground">
        Nothing's happened yet — changes show up here as the group plans.
      </p>
    ) : (
      <ul className="flex flex-col">
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

  // Drawer mode: rows only — the drawer owns the header and scroll.
  if (embedded) return body;

  return (
    <section className="cv-card flex flex-col">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex items-center justify-between gap-3 rounded-card px-4 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2">
          <span className="font-display font-bold">Activity</span>
          {unread > 0 && (
            <span className="rounded-pill bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread} new
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && <div className="cv-divider px-4 pt-2 pb-3">{body}</div>}
    </section>
  );
}

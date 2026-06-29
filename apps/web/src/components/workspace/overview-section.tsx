import {
  computeBalances,
  type FeedEvent,
  type TripMember,
  type TripMoney,
  type TripSnapshot,
} from "@caravan/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { CalendarDays, Pencil } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { AvatarStack } from "@/components/decisions/avatar-stack";
import { BudgetBar } from "@/components/expenses/budget-bar";
import { totalSpend } from "@/components/expenses/summary";
import { daysBetween, todayIso } from "@/components/itinerary/format";
import { formatTripDates } from "@/components/trips/format";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "@/components/workspace/section-heading";
import { budgetStatus, plannedMinor } from "@/lib/expenses/budget";
import { formatMoney } from "@/lib/expenses/money";
import { personColors } from "@/lib/person-colors";
import { relativeTime } from "@/lib/relative-time";
import type { FeedPage } from "@/lib/sync";
import { useMyMember, useTripMutation } from "@/lib/sync";

/**
 * Overview section props (§7). Typed here in Phase 1 so the shell wires real
 * data; Phase 2 fills the body (HeroBand, AttentionChips, GroupBulletin,
 * RecentFeedPeek). Exported so the shell can reference the prop shape.
 */
export interface OverviewSectionProps {
  snapshot: TripSnapshot;
  canEdit: boolean;
  /** Shared money query (planned-vs-actual hero + owe/over chips). */
  moneyQuery: UseQueryResult<TripMoney, Error>;
  /** Feed query (the "Recently" peek). */
  feedQuery: UseQueryResult<FeedPage, Error>;
  /** Jump the canvas to another section (attention chips). */
  scrollTo: (id: string) => void;
  /** Open the full activity-feed drawer ("See all →"). */
  onOpenFeed: () => void;
}

/**
 * The Overview hero (§7b, mockup Frame D) — the first thing in the workspace
 * canvas. A map-released, full-width band: trip identity + countdown + a compact
 * planned-vs-actual budget bar (HeroBand), the triage signals that need the
 * reader's attention (AttentionChips), the shared group note (GroupBulletin,
 * inline-edited via `trip.update`), and a five-line peek at the activity feed
 * (RecentFeedPeek). Everything is derived from already-loaded data — no Overview
 * fetch of its own. Keeps the `#overview` anchor as the scrollspy focus target.
 */
export function OverviewSection({
  snapshot,
  canEdit,
  moneyQuery,
  feedQuery,
  scrollTo,
  onOpenFeed,
}: OverviewSectionProps) {
  return (
    <section
      id="overview"
      aria-labelledby="overview-h"
      tabIndex={-1}
      className="scroll-mt-4 outline-none"
    >
      <div className="flex flex-col gap-4">
        <SectionHeading id="overview" title="Overview" glyph="🧭" />
        <HeroBand snapshot={snapshot} moneyQuery={moneyQuery} />
        <AttentionChips snapshot={snapshot} moneyQuery={moneyQuery} scrollTo={scrollTo} />
        <GroupBulletin bulletin={snapshot.trip.bulletin} canEdit={canEdit} />
        <RecentFeedPeek feedQuery={feedQuery} members={snapshot.members} onOpenFeed={onOpenFeed} />
      </div>
    </section>
  );
}

/* ---------- shared bits ---------- */

/** The small uppercase, letter-spaced caption above each Overview block (mockup `.cap-label`). */
function CapLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-bold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
      {children}
    </p>
  );
}

/* ---------- HeroBand: identity + countdown + budget ---------- */

function HeroBand({
  snapshot,
  moneyQuery,
}: {
  snapshot: TripSnapshot;
  moneyQuery: UseQueryResult<TripMoney, Error>;
}) {
  const { trip, members, activities } = snapshot;

  // Active members carry the avatar stack + the headcount, in join order so the
  // person-color assignment matches every other surface (feed, expenses, polls).
  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active").sort((a, b) => a.joinedAt - b.joinedAt),
    [members],
  );
  const colors = useMemo(() => personColors(activeMembers), [activeMembers]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const tripDays =
    trip.startDate && trip.endDate ? daysBetween(trip.startDate, trip.endDate) + 1 : null;

  // The one-line trip summary (mockup `.summary`): bold name, then dotted facts.
  const facts = [
    formatTripDates(trip.startDate, trip.endDate),
    tripDays !== null ? `${tripDays} ${tripDays === 1 ? "day" : "days"}` : null,
    `${activeMembers.length} going`,
  ].filter((f): f is string => Boolean(f));

  const countdown = buildCountdown(trip.startDate, trip.endDate);

  const planned = plannedMinor(activities);
  const actual = totalSpend(moneyQuery.data?.expenses ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-display font-bold text-[15px] text-muted-foreground leading-snug tracking-tight">
            <span className="text-foreground">{trip.name}</span>
            {facts.length > 0 && <> · {facts.join(" · ")}</>}
          </p>
          {countdown && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-pill border-2 border-border bg-card px-3 py-1 font-bold text-sm shadow-control">
              <CalendarDays aria-hidden className="size-4 text-[var(--accent-strong)]" />
              {countdown}
            </span>
          )}
        </div>
        <AvatarStack
          memberIds={activeMembers.map((m) => m.id)}
          membersById={membersById}
          colors={colors}
          max={6}
        />
      </div>

      {/* Planned-vs-actual budget (V2.6 BudgetBar, compact). Only meaningful with
          a plan: BudgetBar itself returns null when planned === 0, so gate the
          whole captioned block on it to avoid an empty card. */}
      {planned > 0 && (
        <div className="flex flex-col gap-1.5">
          <CapLabel>Budget · planned vs actual</CapLabel>
          <div className="rounded-card border-2 border-border bg-card p-4 shadow-control">
            <BudgetBar
              plannedMinor={planned}
              actualMinor={actual}
              currency={trip.currency}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** "9 days to go" / "Day 3 of 9" / "Wrapped up 2 days ago" / null when undated (§7b). */
function buildCountdown(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const today = todayIso();
  if (today < start) {
    const d = daysBetween(today, start);
    return d === 1 ? "Starts tomorrow" : `${d} days to go`;
  }
  if (today > end) {
    const d = daysBetween(end, today);
    return d === 1 ? "Wrapped up yesterday" : `Wrapped up ${d} days ago`;
  }
  const n = daysBetween(start, today) + 1;
  const m = daysBetween(start, end) + 1;
  return `Day ${n} of ${m}`;
}

/* ---------- AttentionChips: triage signals ---------- */

type ChipTone = "owe" | "budget" | "polls" | "places";

interface ChipData {
  tone: ChipTone;
  glyph: string;
  lede: string;
  detail: string;
  cta: string;
  /** Canvas anchor id to jump to (§5 scrollspy ids). */
  target: string;
}

const TONE_COLORS: Record<ChipTone, { accent: string; soft: string }> = {
  owe: { accent: "var(--primary)", soft: "var(--primary-soft)" },
  budget: { accent: "var(--danger)", soft: "var(--danger-soft)" },
  polls: { accent: "var(--info)", soft: "var(--info-soft)" },
  places: { accent: "var(--info)", soft: "var(--info-soft)" },
};

function AttentionChips({
  snapshot,
  moneyQuery,
  scrollTo,
}: {
  snapshot: TripSnapshot;
  moneyQuery: UseQueryResult<TripMoney, Error>;
  scrollTo: (id: string) => void;
}) {
  const me = useMyMember();
  const { trip, members, activities, polls } = snapshot;
  const currency = trip.currency;
  const money = moneyQuery.data;

  const planned = plannedMinor(activities);
  const actual = totalSpend(money?.expenses ?? []);

  // Net balance for the viewer (over ALL members, so ghost debts persist).
  const balances = useMemo(
    () =>
      computeBalances(
        money?.expenses ?? [],
        money?.payments ?? [],
        members.map((m) => m.id),
      ),
    [money, members],
  );
  const myNet = me ? (balances.find((b) => b.memberId === me.id)?.netMinor ?? 0) : 0;

  const chips: ChipData[] = [];

  // (1) You owe / are owed.
  if (myNet < 0) {
    chips.push({
      tone: "owe",
      glyph: "💸",
      lede: `You owe ${formatMoney(-myNet, currency)}`,
      detail: "Settle up with the group",
      cta: "Settle →",
      target: "money",
    });
  } else if (myNet > 0) {
    chips.push({
      tone: "owe",
      glyph: "💰",
      lede: `You're owed ${formatMoney(myNet, currency)}`,
      detail: "Waiting to be settled",
      cta: "View →",
      target: "money",
    });
  }

  // (2) Over (or nearing) budget — budgetStatus already collapses to "under"
  // when there's no plan, so this never fires without a budget.
  if (budgetStatus(planned, actual) !== "under") {
    const over = actual > planned;
    chips.push({
      tone: "budget",
      glyph: "📉",
      lede: over ? `${formatMoney(actual - planned, currency)} over budget` : "Approaching budget",
      detail: `Actual ${formatMoney(actual, currency)} vs planned ${formatMoney(planned, currency)}`,
      cta: "View →",
      target: "money",
    });
  }

  // (3) Open polls this member hasn't voted in yet.
  const pendingPolls = me
    ? polls.filter((p) => p.closedAt === null && !p.votes.some((v) => v.memberId === me.id)).length
    : 0;
  if (pendingPolls > 0) {
    chips.push({
      tone: "polls",
      glyph: "🗳️",
      lede: `${pendingPolls} ${pendingPolls === 1 ? "poll needs" : "polls need"} your vote`,
      detail: "Weigh in so the group can decide",
      cta: "Vote →",
      target: "ideas",
    });
  }

  // (4) Places with a name but no coordinates — they won't pin or route.
  const unplotted = activities.filter((a) => a.placeName !== null && a.lat === null).length;
  if (unplotted > 0) {
    chips.push({
      tone: "places",
      glyph: "📍",
      lede: `${unplotted} ${unplotted === 1 ? "place isn't" : "places aren't"} on the map yet`,
      detail: "Plot them so the day routes",
      cta: "Plot →",
      target: "itinerary",
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <CapLabel>Needs attention</CapLabel>
      <div className="flex flex-col gap-2.5">
        {chips.map((chip) => (
          <AttentionChip
            key={`${chip.tone}-${chip.target}`}
            chip={chip}
            onClick={() => scrollTo(chip.target)}
          />
        ))}
      </div>
    </div>
  );
}

function AttentionChip({ chip, onClick }: { chip: ChipData; onClick: () => void }) {
  const tone = TONE_COLORS[chip.tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex w-full items-center gap-3 overflow-hidden rounded-card border-2 border-border bg-card py-3 pr-4 pl-5 text-left shadow-control outline-none transition-transform hover:-translate-y-px focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/* Tone accent bar (mockup `.sig:before`). */}
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-1.5 rounded-pill"
        style={{ backgroundColor: tone.accent }}
      />
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-control border-2 border-border text-lg"
        style={{ backgroundColor: tone.soft }}
      >
        {chip.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-bold text-[15px] text-foreground leading-tight">
          {chip.lede}
        </span>
        <span className="block text-muted-foreground text-xs">{chip.detail}</span>
      </span>
      <span aria-hidden className="shrink-0 font-bold text-sm" style={{ color: tone.accent }}>
        {chip.cta}
      </span>
    </button>
  );
}

/* ---------- GroupBulletin: shared note, inline-edited ---------- */

// TODO: per-bulletin updatedAt/updatedBy in a follow-up (trips.updatedAt is
// trip-level — bumped by every mutation — so there's no honest attribution to
// show here yet).
function GroupBulletin({ bulletin, canEdit }: { bulletin: string | null; canEdit: boolean }) {
  const { mutateAsync } = useTripMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter commits, then blur fires as the textarea unmounts — settle exactly once.
  const doneRef = useRef(false);

  function begin() {
    if (!canEdit) return;
    setDraft(bulletin ?? "");
    doneRef.current = false;
    setEditing(true);
  }

  function finish(save: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    if (!save) return;
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next !== bulletin && (next === null || next.length <= 5000)) {
      void mutateAsync("trip.update", { bulletin: next }).catch(() => {});
    }
  }

  // Nothing to show and nothing to add → omit the block entirely.
  if (bulletin === null && !canEdit && !editing) return null;

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <CapLabel>📌 Group bulletin</CapLabel>
        <Textarea
          autoFocus
          value={draft}
          maxLength={5000}
          rows={3}
          aria-label="Group bulletin"
          placeholder="Add a note for the group…"
          className="rounded-card bg-card shadow-control"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              finish(false);
            }
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Enter to save · Shift+Enter for a new line · Esc to cancel
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <CapLabel>📌 Group bulletin</CapLabel>
        {canEdit && (
          <button
            type="button"
            onClick={begin}
            className="inline-flex items-center gap-1 rounded-sm font-bold text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Pencil aria-hidden className="size-3" />
            {bulletin === null ? "Add" : "Edit"}
          </button>
        )}
      </div>
      {bulletin === null ? (
        // canEdit is guaranteed here (the null + !canEdit case returned above).
        <button
          type="button"
          onClick={begin}
          className="rounded-card border-2 border-border border-dashed bg-muted px-4 py-3 text-left text-muted-foreground text-sm italic outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Add a note for the group…
        </button>
      ) : canEdit ? (
        <button
          type="button"
          onClick={begin}
          className="rounded-card border-2 border-border bg-card px-4 py-3 text-left shadow-control outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <p className="whitespace-pre-wrap break-words text-foreground text-sm leading-relaxed">
            {bulletin}
          </p>
        </button>
      ) : (
        <div className="rounded-card border-2 border-border bg-card px-4 py-3 shadow-control">
          <p className="whitespace-pre-wrap break-words text-foreground text-sm leading-relaxed">
            {bulletin}
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- RecentFeedPeek: the five newest feed events ---------- */

function RecentFeedPeek({
  feedQuery,
  members,
  onOpenFeed,
}: {
  feedQuery: UseQueryResult<FeedPage, Error>;
  members: TripMember[];
  onOpenFeed: () => void;
}) {
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const recent = (feedQuery.data?.events ?? []).slice(0, 5);

  // A peek with nothing to peek at is noise — the top-bar bell still opens the
  // full feed. Hide until there's at least one event.
  if (recent.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <CapLabel>Recently</CapLabel>
        <button
          type="button"
          onClick={onOpenFeed}
          className="rounded-sm font-bold text-primary text-xs outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          See all →
        </button>
      </div>
      <ul className="flex flex-col">
        {recent.map((event) => {
          const member = event.actorMemberId ? membersById.get(event.actorMemberId) : undefined;
          const name = event.actorType !== "user" ? "Scout" : (member?.name ?? "Someone");
          return (
            <li key={event.id} className="flex items-center gap-2.5 py-1 text-foreground text-sm">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--ink-faint)]" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold">{name}</span> {feedVerb(event)}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {relativeTime(event.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A compact verb phrase for a peek row, keyed on mutation type (mirrors the
 * FeedDrawer's `describe`, trimmed to the events that realistically surface in a
 * five-line peek; everything else falls back to a generic phrase).
 */
function feedVerb(event: FeedEvent): string {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const str = (key: string, fallback: string) =>
    typeof p[key] === "string" ? (p[key] as string) : fallback;
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
    case "vote.toggle":
      return p.on === false ? "removed a vote" : `voted for ${str("activityTitle", "an idea")}`;
    case "poll.create":
      return `opened “${str("question", "a poll")}”`;
    case "poll.vote":
      return `voted in “${str("question", "a poll")}”`;
    case "poll.close":
      return `closed “${str("question", "a poll")}”`;
    case "comment.create":
      return `commented on ${str("targetTitle", "a discussion")}`;
    case "expense.create":
      return `added the expense ${str("description", "an expense")}`;
    case "expense.update":
      return `edited the expense ${str("description", "an expense")}`;
    case "expense.delete":
      return `removed the expense ${str("description", "an expense")}`;
    case "payment.create":
      return "recorded a payment";
    case "trip.update":
      return "updated the trip";
    case "member.leave":
      return "left the trip";
    default:
      return "made a change";
  }
}

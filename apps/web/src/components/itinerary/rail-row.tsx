import type { Activity, ChecklistItem, MutationPayload } from "@caravan/shared";
import {
  Heart,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { isPlotted } from "@/components/map/geo-features";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatMoney, minorToInput, parseMoney } from "@/lib/expenses/money";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "./categories";
import { formatTimeRange } from "./format";

/** The shape of an `activity.update` patch — the same pipeline the ⋯ menu's
 * Edit-details dialog writes through (mutations.ts). Inline edits send a minimal
 * one- or two-field patch. */
type ActivityPatch = MutationPayload<"activity.update">["patch"];

/** The stamp's vertical center, measured from the row's top edge (py-2 = 0.5rem
 * plus half of the 1.75rem stamp). The spine connector anchors to it so the line
 * threads stamp-to-stamp rather than running the full row height. */
const SPINE_TOP = "1.375rem";

/** The "add cost / add time" empty-slot affordance on an editable stop row.
 * Reveal-on-hover/focus mirrors the ⋯ row menu (opacity, not display, so the hit
 * area persists for touch and the control stays keyboard-reachable). */
const ADD_AFFORDANCE_CLASS =
  "whitespace-nowrap rounded-pill border border-dashed border-[var(--ink-faint)] px-1.5 py-0.5 font-body text-xs text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-focus-within:opacity-100 group-hover:opacity-100";

export interface RailRowProps {
  activity: Activity;
  /** 1-based per-day stop number from `computeStopNumbers`; null for note/checklist. */
  number: number | null;
  /** Position in the day's full row list — drives the spine connector ends. */
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  /** Trip currency for the est-cost chip. */
  currency?: string;
  voteCount?: number;
  commentCount?: number;
  /** Who created the row (reuses `useMemberColors`). */
  addedBy?: { name: string; color: string };
  /** A live hint that another member is editing this row right now (PD-5). */
  editingBy?: { name: string; color: string };
  /** Briefly true right after a remote change lands, to draw the eye (PD-5). */
  flash?: boolean;
  /** This row is the highlighted one on the ambient map (Track C selection). */
  selected?: boolean;
  /** Toggle this stop's pin on the map. Only meaningful when it's plotted. */
  onSelect?: () => void;
  onEdit?: (activity: Activity) => void;
  onDelete?: (activity: Activity) => void;
  /** Commit an inline edit on this row's activity (optimistic `activity.update`).
   * Powers the click-to-edit cost chip and time fields (§C.3). Absent → those
   * fields render read-only. */
  onUpdate?: (patch: ActivityPatch) => void;
  /** Check/uncheck one checklist entry (optimistic `checklist.toggle`). */
  onToggleChecklistItem?: (itemId: string, done: boolean) => void;
  /** The full vote/comment footer, revealed when the inline counts are clicked. */
  footer?: ReactNode;
  /** dnd-kit plumbing — the sortable wrapper passes these onto the <li> node. */
  innerRef?: (el: HTMLLIElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
  dragHandle?: ReactNode;
}

/** Props + the local "footer expanded" state, threaded to the sub-renderers. */
type Ctx = RailRowProps & { footerOpen: boolean; onToggleFooter: () => void };

/**
 * A single row of the progression rail (Plan View v2, spec §C). Branches on
 * `activity.type`: a two-line numbered **stop**, or an un-numbered inline
 * **note** / **checklist**. Number stamps sit on a 2px connector spine threading
 * the day; the stamp number matches the map pin (§C.6).
 */
export function RailRow(props: RailRowProps) {
  const { activity, innerRef, style, isDragging, dragHandle, flash, selected, footer } = props;
  const [footerOpen, setFooterOpen] = useState(false);
  const ctx: Ctx = { ...props, footerOpen, onToggleFooter: () => setFooterOpen((v) => !v) };
  const isStop = activity.type === "activity";

  return (
    <li
      ref={innerRef}
      style={{
        ...style,
        ...(flash ? { outlineColor: "var(--accent-strong)" } : null),
      }}
      className={cn(
        // No vertical padding on the <li>: the gutter is a flex sibling that
        // stretches to the row's content box, so the spine reaches edge-to-edge
        // and consecutive rows' segments meet (continuity). Rhythm lives in the
        // body's py-2; rows sit flush (the <ol> has no gap).
        "group relative flex gap-2 pr-1 transition-[outline-color] duration-500",
        flash && "rounded-control outline outline-2 outline-offset-2",
        selected && "rounded-control ring-2 ring-[var(--accent-strong)]",
        isDragging && "opacity-40",
      )}
    >
      {dragHandle}
      <Spine {...ctx} />
      <div className="min-w-0 flex-1 py-2">
        {isStop ? <StopBody {...ctx} /> : <TypedBody {...ctx} />}
        {footerOpen && <div className="mt-2">{footer}</div>}
      </div>
      <RowMenu {...ctx} />
    </li>
  );
}

/** The left gutter: the 2px connector spine plus the row's stamp/mark. */
function Spine({ activity, number, isFirst, isLast }: Ctx) {
  const single = isFirst && isLast;
  const connectorStyle: CSSProperties = isLast
    ? { top: isFirst ? SPINE_TOP : "0px", height: SPINE_TOP, bottom: "auto" }
    : { top: isFirst ? SPINE_TOP : "0px", bottom: "0px" };

  return (
    <div className="relative w-9 shrink-0">
      {!single && (
        <span
          aria-hidden
          className="absolute left-1/2 w-0.5 -translate-x-1/2 bg-[var(--ink-faint)]"
          style={connectorStyle}
        />
      )}
      {/* pt-2 mirrors the body's py-2 so the stamp centers on line 1. */}
      <div className="flex justify-center pt-2">
        {activity.type === "activity" ? (
          <NumberStamp activity={activity} n={number} />
        ) : (
          <SpineMark type={activity.type} />
        )}
      </div>
    </div>
  );
}

/** The order-driven square number stamp — filled when plotted, hollow (dashed)
 * when unplotted, so a missing map pin reads as "not located yet" (§C.2/§C.6). */
function NumberStamp({ activity, n }: { activity: Activity; n: number | null }) {
  const plotted = isPlotted(activity);
  const meta = CATEGORY_META[activity.category];
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex size-7 items-center justify-center rounded-stamp font-display text-sm font-bold text-foreground",
        plotted ? "shadow-pressed" : "border-2 border-dashed border-[var(--ink-faint)]",
      )}
      style={{ backgroundColor: plotted ? meta.soft : "var(--paper-bright)" }}
    >
      {n ?? ""}
    </span>
  );
}

/** Round, soft-tinted anchor-mark for un-numbered note/checklist rows (§C.5). */
function SpineMark({ type }: { type: Activity["type"] }) {
  const note = type === "note";
  const Icon = note ? StickyNote : ListChecks;
  return (
    <span
      aria-hidden
      className="relative z-10 flex size-7 items-center justify-center rounded-full border"
      style={{
        backgroundColor: note ? "var(--info-soft)" : "var(--success-soft)",
        color: note ? "var(--info)" : "var(--success)",
      }}
    >
      <Icon className="size-4" strokeWidth={2.25} />
    </span>
  );
}

/** A two-line stop: line 1 (glyph · title · cost · time), line 2 (place · meta /
 * vote+comment counts), plus attribution. */
function StopBody(ctx: Ctx) {
  const { activity, number, currency = "USD", canEdit, onUpdate, onSelect, selected } = ctx;
  const meta = CATEGORY_META[activity.category];
  const selectable = Boolean(onSelect) && isPlotted(activity);

  return (
    <>
      {number != null && <span className="sr-only">{`Stop ${number}. `}</span>}
      {/* line 1 */}
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 shrink-0" style={{ color: meta.color }}>
          <meta.Icon className="size-4" strokeWidth={2.25} />
        </span>
        <h4 className="min-w-0 flex-1 truncate font-display font-bold leading-snug">
          {selectable ? (
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              title={selected ? "Hide on map" : "Show on map"}
              className="block max-w-full truncate rounded-sm text-left outline-none transition-colors hover:text-[var(--accent-strong)] focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {activity.title}
            </button>
          ) : (
            activity.title
          )}
        </h4>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <CostChip activity={activity} currency={currency} canEdit={canEdit} onUpdate={onUpdate} />
          <TimeChip activity={activity} canEdit={canEdit} onUpdate={onUpdate} />
        </div>
      </div>

      {/* line 2 — always present (F.2) */}
      <div className="mt-0.5 flex min-h-5 items-start gap-2 pl-6">
        <p className="min-w-0 flex-1 truncate text-sm" title={activity.placeName ?? undefined}>
          <PlaceMeta activity={activity} />
        </p>
        <FootCounts {...ctx} />
      </div>

      <RowAttribution {...ctx} />
    </>
  );
}

/**
 * The estimated-cost chip, click-to-edit when the row is editable (§C.3).
 * Mirrors the day-subtitle editor: click → currency-aware numeric input, Enter
 * or blur commits, Esc cancels; commits flow through `activity.update`
 * (`estimatedCostMinor`). An empty value clears the estimate. Render the chip
 * read-only for viewers; an editor with no estimate yet gets a hover/focus-
 * revealed "add" affordance so the rail stays uncluttered.
 */
function CostChip({
  activity,
  currency,
  canEdit,
  onUpdate,
}: {
  activity: Activity;
  currency: string;
  canEdit: boolean;
  onUpdate?: (patch: ActivityPatch) => void;
}) {
  const cost = activity.estimatedCostMinor;
  const editable = canEdit && Boolean(onUpdate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter commits, then blur fires as the input unmounts — settle exactly once.
  const doneRef = useRef(false);

  function begin() {
    if (!editable) return;
    setDraft(cost != null ? minorToInput(cost, currency) : "");
    doneRef.current = false;
    setEditing(true);
  }
  function finish(save: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    if (!save) return;
    const trimmed = draft.trim();
    // Empty clears the estimate; an unparseable amount is a no-op (revert).
    const next = trimmed === "" ? null : parseMoney(trimmed, currency);
    if (trimmed !== "" && next === null) return;
    if (next !== cost) onUpdate?.({ estimatedCostMinor: next });
  }

  if (editing) {
    return (
      <Input
        autoFocus
        inputMode="decimal"
        value={draft}
        aria-label={`Estimated cost in ${currency}`}
        placeholder="0.00"
        className="h-7 w-20 text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          else if (e.key === "Escape") finish(false);
        }}
      />
    );
  }

  if (cost == null) {
    if (!editable) return null;
    return (
      <button
        type="button"
        onClick={begin}
        aria-label="Add estimated cost"
        title="Add estimated cost"
        className={cn(ADD_AFFORDANCE_CLASS, "font-semibold")}
      >
        + cost
      </button>
    );
  }

  const formatted = formatMoney(cost, currency);
  const chipClass =
    "rounded-pill border px-1.5 py-0.5 font-body text-xs font-semibold text-foreground";
  if (!editable) {
    return (
      <span className={chipClass} style={{ backgroundColor: "var(--success-soft)" }}>
        {formatted}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={begin}
      aria-label={`Edit estimated cost, currently ${formatted}`}
      title="Edit estimated cost"
      className={cn(
        chipClass,
        "outline-none transition-colors hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
      style={{ backgroundColor: "var(--success-soft)" }}
    >
      {formatted}
    </button>
  );
}

/**
 * The stop's start/end time, click-to-edit when the row is editable (§C.3).
 * Same model as the cost chip but with two native time inputs; Enter or blur
 * commits via `activity.update` (`startTime`/`endTime`), Esc cancels. End must
 * not precede start: Enter on an invalid range surfaces the error and stays
 * open; clicking away reverts. A timeless stop gets a hover/focus-revealed
 * "add" affordance.
 */
function TimeChip({
  activity,
  canEdit,
  onUpdate,
}: {
  activity: Activity;
  canEdit: boolean;
  onUpdate?: (patch: ActivityPatch) => void;
}) {
  const start = activity.startTime;
  const end = activity.endTime;
  const editable = canEdit && Boolean(onUpdate);
  const [editing, setEditing] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [invalid, setInvalid] = useState(false);
  const doneRef = useRef(false);
  // Spans both time inputs; commit-on-blur fires only when focus leaves the pair
  // (moving start→end keeps focus inside, so it must not settle yet).
  const groupRef = useRef<HTMLSpanElement>(null);

  function begin() {
    if (!editable) return;
    setDraftStart(start ?? "");
    setDraftEnd(end ?? "");
    setInvalid(false);
    doneRef.current = false;
    setEditing(true);
  }
  // `keepOpenOnInvalid` (Enter) flags the bad range and stays open; blur/click-
  // away passes false so an invalid range simply reverts instead of trapping.
  function finish(save: boolean, keepOpenOnInvalid = false) {
    if (doneRef.current) return;
    const nextStart = draftStart || null;
    const nextEnd = draftEnd || null;
    if (save && nextStart && nextEnd && nextStart > nextEnd) {
      if (keepOpenOnInvalid) {
        setInvalid(true);
        return;
      }
      save = false;
    }
    doneRef.current = true;
    setEditing(false);
    if (!save) return;
    const patch: ActivityPatch = {};
    if (nextStart !== start) patch.startTime = nextStart;
    if (nextEnd !== end) patch.endTime = nextEnd;
    if (Object.keys(patch).length > 0) onUpdate?.(patch);
  }

  if (editing) {
    // Shared by both inputs: keydown commits/cancels; blur settles only when
    // focus has left the pair entirely (Enter keeps an invalid range open).
    const onKeyDown = (e: ReactKeyboardEvent) => {
      if (e.key === "Enter") finish(true, true);
      else if (e.key === "Escape") finish(false);
    };
    const onBlur = (e: ReactFocusEvent) => {
      if (groupRef.current?.contains(e.relatedTarget as Node | null)) return;
      finish(true);
    };
    return (
      <span ref={groupRef} className="flex items-center gap-1">
        <Input
          autoFocus
          type="time"
          value={draftStart}
          aria-label="Start time"
          aria-invalid={invalid || undefined}
          className="h-7 w-28 px-2 text-xs"
          onChange={(e) => {
            setDraftStart(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <Input
          type="time"
          value={draftEnd}
          aria-label="End time"
          aria-invalid={invalid || undefined}
          className="h-7 w-28 px-2 text-xs"
          onChange={(e) => {
            setDraftEnd(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
      </span>
    );
  }

  const timeRange = formatTimeRange(start, end);
  if (!timeRange) {
    if (!editable) return null;
    return (
      <button
        type="button"
        onClick={begin}
        aria-label="Add a time"
        title="Add a time"
        className={ADD_AFFORDANCE_CLASS}
      >
        + time
      </button>
    );
  }
  if (!editable) {
    return <span className="whitespace-nowrap text-xs text-muted-foreground">{timeRange}</span>;
  }
  return (
    <button
      type="button"
      onClick={begin}
      aria-label={`Edit time, currently ${timeRange}`}
      title="Edit time"
      className="whitespace-nowrap rounded-sm text-xs text-muted-foreground underline decoration-dotted underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {timeRange}
    </button>
  );
}

/** Line-2 left cluster: place name + a notes hint, or the unplotted explainer. */
function PlaceMeta({ activity }: { activity: Activity }) {
  const plotted = isPlotted(activity);
  if (activity.placeName) {
    return (
      <>
        <span className="font-semibold text-foreground">{activity.placeName}</span>
        {!plotted && <span className="italic text-muted-foreground"> · not located yet</span>}
        {plotted && activity.notes && (
          <span className="italic text-muted-foreground"> · {activity.notes}</span>
        )}
      </>
    );
  }
  if (activity.notes) {
    return <span className="italic text-muted-foreground">{activity.notes}</span>;
  }
  return <span className="text-muted-foreground/70">—</span>;
}

/** Note / checklist body — un-numbered inline rows (§C.5). */
function TypedBody(ctx: Ctx) {
  const { activity } = ctx;
  return (
    <>
      <h4 className="truncate font-display font-bold leading-snug">{activity.title}</h4>
      {activity.type === "note" ? (
        activity.notes ? (
          <blockquote className="mt-1 border-l-2 border-[var(--ink-faint)] pl-2 text-sm italic text-muted-foreground">
            {activity.notes}
          </blockquote>
        ) : null
      ) : (
        <ChecklistBody {...ctx} />
      )}
      <div className="mt-1 flex items-start">
        <FootCounts {...ctx} />
      </div>
      <RowAttribution {...ctx} />
    </>
  );
}

/** Real checkboxes wired to an optimistic per-item `checklist.toggle`. */
function ChecklistBody({ activity, canEdit, onToggleChecklistItem }: Ctx) {
  const items: ChecklistItem[] = activity.checklistItems ?? [];
  const done = items.filter((i) => i.done).length;
  return (
    <div className="mt-1">
      <span className="rounded-pill border bg-accent-soft px-1.5 py-0.5 font-body text-xs font-semibold text-muted-foreground">
        {done}/{items.length}
      </span>
      <ul className="mt-1.5 grid gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canEdit}
              aria-label={item.text}
              onChange={() => onToggleChecklistItem?.(item.id, !item.done)}
              className="size-4 shrink-0 accent-[var(--accent-strong)]"
            />
            <span
              className={cn("min-w-0 truncate", item.done && "text-muted-foreground line-through")}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Collapsed vote/comment counts; clicking reveals the full footer beneath. */
function FootCounts({ voteCount = 0, commentCount = 0, onToggleFooter, footerOpen }: Ctx) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onToggleFooter}
        aria-expanded={footerOpen}
        aria-label={`${voteCount} in — show votes and comments`}
        className="inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-xs outline-none hover:bg-accent-soft focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Heart aria-hidden className="size-3.5 text-[var(--primary)]" />
        <span className={voteCount > 0 ? "text-foreground" : "text-muted-foreground"}>
          {voteCount}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleFooter}
        aria-expanded={footerOpen}
        aria-label={`${commentCount} comments — show votes and comments`}
        className="inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-xs outline-none hover:bg-accent-soft focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <MessageSquare aria-hidden className="size-3.5 text-muted-foreground" />
        <span className={commentCount > 0 ? "text-foreground" : "text-muted-foreground"}>
          {commentCount}
        </span>
      </button>
    </div>
  );
}

function RowAttribution({ addedBy, editingBy }: Ctx) {
  if (!addedBy && !editingBy) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      {addedBy && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <span
            aria-hidden
            className="flex size-4 select-none items-center justify-center rounded-full font-semibold text-[9px] text-white"
            style={{ backgroundColor: addedBy.color }}
          >
            {addedBy.name.trim().charAt(0) || "?"}
          </span>
          Added by {addedBy.name}
        </span>
      )}
      {editingBy && (
        <span className="flex items-center gap-1 font-semibold" style={{ color: editingBy.color }}>
          <span aria-hidden>✦</span>
          {editingBy.name} is editing…
        </span>
      )}
    </div>
  );
}

function RowMenu({ activity, canEdit, onEdit, onDelete }: Ctx) {
  if (!canEdit || !onEdit || !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${activity.title}`}
          className="-mr-1 mt-1.5 shrink-0 self-start text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(activity)}>
          <Pencil aria-hidden />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(activity)}>
          <Trash2 aria-hidden />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

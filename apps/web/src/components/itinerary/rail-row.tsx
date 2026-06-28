import type { Activity, ChecklistItem } from "@caravan/shared";
import {
  Heart,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  StickyNote,
  Trash2,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { isPlotted } from "@/components/map/geo-features";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/expenses/money";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "./categories";
import { formatTimeRange } from "./format";

/** The stamp's vertical center, measured from the row's top edge (py-2 = 0.5rem
 * plus half of the 1.75rem stamp). The spine connector anchors to it so the line
 * threads stamp-to-stamp rather than running the full row height. */
const SPINE_TOP = "1.375rem";

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
  const { activity, number, currency = "USD", onSelect, selected } = ctx;
  const meta = CATEGORY_META[activity.category];
  const timeRange = formatTimeRange(activity.startTime, activity.endTime);
  const cost = activity.estimatedCostMinor;
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
          {cost != null && (
            <span
              className="rounded-pill border px-1.5 py-0.5 font-body text-xs font-semibold text-foreground"
              style={{ backgroundColor: "var(--success-soft)" }}
            >
              {formatMoney(cost, currency)}
            </span>
          )}
          {timeRange && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">{timeRange}</span>
          )}
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

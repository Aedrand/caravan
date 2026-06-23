import { type Activity, positionBetween, type TripSnapshot } from "@caravan/shared";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, Lightbulb, Plus } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityFooter } from "@/components/decisions/activity-footer";
import {
  commentsFor,
  useCommentsByTarget,
  useMembersById,
  useVotesByActivity,
} from "@/components/decisions/use-decisions";
import { Button } from "@/components/ui/button";
import { FALLBACK_PERSON_COLOR, personColors } from "@/lib/person-colors";
import { useMyMember, usePresence, useTripMutation } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { ActivityCard } from "./activity-card";
import { ActivityFormDialog } from "./activity-form-dialog";
import { dayNumber, deriveDays, formatDayLabel, formatDayShort, todayIso } from "./format";
import { SortableActivityCard } from "./sortable-activity-card";

type EditingHint = { name: string; color: string };

type DialogState =
  | { mode: "create"; defaultDate: string | null }
  | { mode: "edit"; activity: Activity }
  | null;

const colId = (date: string | null): string => `col:${date ?? "ideas"}`;
const colDate = (id: string): string | null => {
  const v = id.slice(4);
  return v === "ideas" ? null : v;
};

function groupByDate(activities: Activity[]): Map<string | null, Activity[]> {
  const map = new Map<string | null, Activity[]>();
  for (const a of activities) {
    const arr = map.get(a.date) ?? [];
    arr.push(a);
    map.set(a.date, arr);
  }
  for (const arr of map.values()) {
    arr.sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : 0));
  }
  return map;
}

/** Imperative handle so an out-of-tree control (the mobile add FAB) can open
 * the create dialog without reaching into the board's private dialog state. */
export interface ItineraryBoardHandle {
  addActivity: () => void;
}

export function ItineraryBoard({
  snapshot,
  canEdit,
  onOpenDecide,
  handleRef,
}: {
  snapshot: TripSnapshot;
  canEdit: boolean;
  /** Switch the workspace to the Decide view (where the ideas pool now lives). */
  onOpenDecide?: () => void;
  /** Lets the workspace's mobile FAB trigger "add activity" (see handle). */
  handleRef?: RefObject<ItineraryBoardHandle | null>;
}) {
  const { trip, activities } = snapshot;
  const { mutateAsync } = useTripMutation();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const days = useMemo(
    () => deriveDays(trip.startDate, trip.endDate, activities),
    [trip.startDate, trip.endDate, activities],
  );
  const byDate = useMemo(() => groupByDate(activities), [activities]);

  // Track A: votes + comments rails, and the ideas-by-votes default sort (PD-2).
  const votesByActivity = useVotesByActivity(snapshot.votes);
  const commentsByTarget = useCommentsByTarget(snapshot.comments);
  const membersById = useMembersById(snapshot.members);

  // Ideas live in Decide now (C.4); Plan keeps just a pointer with the count.
  const ideaCount = (byDate.get(null) ?? []).length;

  const activeActivity = activeId ? activities.find((a) => a.id === activeId) : null;

  const me = useMyMember();
  const presence = usePresence();
  const reportView = presence.reportView;

  const colors = useMemo(() => {
    const active = snapshot.members
      .filter((m) => m.status === "active")
      .sort((a, b) => a.joinedAt - b.joinedAt);
    return personColors(active);
  }, [snapshot.members]);

  // Which activity each *other* online member is editing right now (PD-5).
  const editingHints = useMemo(() => {
    const map = new Map<string, EditingHint>();
    for (const p of presence.members) {
      if (p.memberId === me?.id || !p.view.editing) continue;
      map.set(p.view.editing, {
        name: p.name,
        color: colors.get(p.memberId) ?? FALLBACK_PERSON_COLOR,
      });
    }
    return map;
  }, [presence.members, me?.id, colors]);

  const flashing = useRecentlyEdited(activities);

  // --- Long-trip day navigation (C.4 stage 2) ---
  // Focus drives the rail highlight (and, in time, the map). Collapse defaults
  // to "today + the days still ahead" so a 40-day trip opens on what's next.
  const today = todayIso();
  const todayInTrip = days.includes(today);
  const emptyDays = useMemo(
    () => new Set(days.filter((iso) => (byDate.get(iso) ?? []).length === 0)),
    [days, byDate],
  );
  const [focusedIso, setFocusedIso] = useState<string>(() =>
    todayInTrip ? today : (days[0] ?? ""),
  );
  const [collapseOverride, setCollapseOverride] = useState<Record<string, boolean>>({});
  const defaultOpen = (iso: string): boolean =>
    (byDate.get(iso) ?? []).length > 0 && (!todayInTrip || iso >= today);
  const isOpen = (iso: string): boolean => collapseOverride[iso] ?? defaultOpen(iso);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const jumpTo = (iso: string) => {
    if (!iso) return;
    setFocusedIso(iso);
    setCollapseOverride((o) => ({ ...o, [iso]: true }));
    requestAnimationFrame(() =>
      sectionRefs.current[iso]?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // Tell the room which activity we're editing, so others see the hint.
  useEffect(() => {
    const editing = dialog?.mode === "edit" ? dialog.activity.id : null;
    reportView({ date: null, activityId: editing, editing });
  }, [dialog, reportView]);

  const appendPositionFor = (date: string | null): string => {
    const last = (byDate.get(date) ?? []).at(-1)?.position ?? null;
    return positionBetween(last, null);
  };

  const openCreate = (date: string | null) => setDialog({ mode: "create", defaultDate: date });
  const openEdit = (activity: Activity) => setDialog({ mode: "edit", activity });

  // Mirror the toolbar's "Add activity" default (first day, or the ideas pool
  // when there are no dated days) so the mobile FAB opens the same dialog.
  useImperativeHandle(handleRef, () => ({
    addActivity: () => openCreate(days[0] ?? null),
  }));
  const remove = (activity: Activity) =>
    void mutateAsync("activity.delete", { activityId: activity.id }).catch(() => {});

  // The votes + comments rail under each card (Track A). `canEdit` gates voting
  // and commenting (viewers see tallies + threads read-only).
  const renderFooter = (activity: Activity): ReactNode => (
    <ActivityFooter
      activityId={activity.id}
      voterIds={votesByActivity.get(activity.id) ?? []}
      comments={commentsFor(commentsByTarget, "activity", activity.id)}
      myMember={me}
      canEdit={canEdit}
      membersById={membersById}
      colors={colors}
    />
  );

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    const moving = activities.find((a) => a.id === activeKey);
    if (!moving) return;

    // Target column: dropping onto a column droppable, or onto another card.
    const overActivity = overKey.startsWith("col:")
      ? null
      : activities.find((a) => a.id === overKey);
    const targetDate = overKey.startsWith("col:") ? colDate(overKey) : (overActivity?.date ?? null);

    const targetItems = (byDate.get(targetDate) ?? []).filter((a) => a.id !== activeKey);
    const insertIndex = overActivity
      ? Math.max(
          0,
          targetItems.findIndex((a) => a.id === overKey),
        )
      : targetItems.length;
    const before = targetItems[insertIndex - 1] ?? null;
    const after = targetItems[insertIndex] ?? null;

    // Skip a drop that lands in the same slot it started from (no feed noise).
    if (targetDate === moving.date) {
      const col = byDate.get(moving.date) ?? [];
      const idx = col.findIndex((a) => a.id === activeKey);
      const curBefore = col[idx - 1]?.id ?? null;
      const curAfter = col[idx + 1]?.id ?? null;
      if ((before?.id ?? null) === curBefore && (after?.id ?? null) === curAfter) return;
    }

    const position = positionBetween(before?.position ?? null, after?.position ?? null);
    void mutateAsync("activity.move", {
      activityId: activeKey,
      date: targetDate,
      position,
    }).catch(() => {});
  }

  const isEmpty = activities.length === 0 && days.length === 0;

  return (
    <section className="flex flex-col gap-3">
      {isEmpty ? (
        <div className="cv-card flex flex-col items-center gap-3 p-10 text-center">
          <p className="font-display text-lg font-bold">Nothing planned yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Set the trip dates to lay out days, or drop a first idea in the pool — the group can
            vote on it later.
          </p>
          {canEdit && (
            <Button className="mt-1" onClick={() => openCreate(null)}>
              <Plus aria-hidden />
              Add an idea
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Sticky day-jump rail — scannable across a 2-day weekend or a 40-day epic. */}
          <div className="-mx-5 -mt-5 sticky top-0 z-10 mb-1 border-b border-border/70 bg-background/95 px-5 py-2 backdrop-blur">
            <div className="flex items-center gap-2">
              <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1">
                <DayRail
                  days={days}
                  focusedIso={focusedIso}
                  today={todayInTrip ? today : null}
                  emptyDays={emptyDays}
                  onJump={jumpTo}
                />
              </div>
              {todayInTrip && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => jumpTo(today)}
                >
                  Today
                </Button>
              )}
              {days.length > 1 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="hidden shrink-0 sm:inline-flex"
                  onClick={() => jumpTo(days[0] ?? "")}
                >
                  Trip start
                </Button>
              )}
              {canEdit && (
                <Button size="sm" className="shrink-0" onClick={() => openCreate(days[0] ?? null)}>
                  <Plus aria-hidden />
                  Add activity
                </Button>
              )}
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            {/* Ideas moved to Decide — Plan keeps a compact pointer. Sits at the
                top so it's seen even on a long trip you'd otherwise scroll past. */}
            <button
              type="button"
              onClick={onOpenDecide}
              className="mb-2 flex w-full items-center gap-3 rounded-card border bg-accent-soft px-4 py-3 text-left shadow-control transition-colors hover:bg-accent"
            >
              <Lightbulb aria-hidden className="size-5 shrink-0 text-[var(--accent-strong)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold">
                  {ideaCount > 0
                    ? `${ideaCount} ${ideaCount === 1 ? "idea" : "ideas"} the group's floating`
                    : "No ideas yet"}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {ideaCount > 0
                    ? "Vote on them in Decide — top picks become days"
                    : "Float a place the group can vote on"}
                </span>
              </span>
              <span className="shrink-0 font-body text-sm font-bold">Open Decide →</span>
            </button>

            <div className="flex flex-col gap-1.5">
              {days.map((iso) => (
                <DayBlock
                  key={iso}
                  sectionRef={(el) => {
                    sectionRefs.current[iso] = el;
                  }}
                  iso={iso}
                  n={dayNumber(iso, trip.startDate)}
                  items={byDate.get(iso) ?? []}
                  isToday={iso === today}
                  open={isOpen(iso)}
                  onToggle={() => setCollapseOverride((o) => ({ ...o, [iso]: !isOpen(iso) }))}
                  onFocus={() => setFocusedIso(iso)}
                  canEdit={canEdit}
                  editingHints={editingHints}
                  flashing={flashing}
                  onAdd={() => openCreate(iso)}
                  onEdit={openEdit}
                  onDelete={remove}
                  renderFooter={renderFooter}
                />
              ))}
            </div>

            {/* No drop animation: our reorder lands via the async activity.move
                optimistic update, so the default settle would animate the overlay
                back to the (not-yet-moved) source slot before the list re-renders
                — the "snap back, then jump" glitch. Dropping instantly into the
                new slot reads clean. */}
            <DragOverlay dropAnimation={null}>
              {activeActivity ? (
                <ActivityCard
                  activity={activeActivity}
                  canEdit={false}
                  onEdit={openEdit}
                  onDelete={remove}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      <ActivityFormDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        mode={dialog?.mode ?? "create"}
        activity={dialog?.mode === "edit" ? dialog.activity : undefined}
        defaultDate={dialog?.mode === "create" ? dialog.defaultDate : undefined}
        days={days}
        startDate={trip.startDate}
        mutateAsync={mutateAsync}
        appendPositionFor={appendPositionFor}
      />
    </section>
  );
}

function DayBlock({
  sectionRef,
  iso,
  n,
  items,
  isToday,
  open,
  onToggle,
  onFocus,
  canEdit,
  editingHints,
  flashing,
  onAdd,
  onEdit,
  onDelete,
  renderFooter,
}: {
  sectionRef: (el: HTMLElement | null) => void;
  iso: string;
  n: number | null;
  items: Activity[];
  isToday: boolean;
  open: boolean;
  onToggle: () => void;
  onFocus: () => void;
  canEdit: boolean;
  editingHints: Map<string, EditingHint>;
  flashing: Set<string>;
  onAdd: () => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  renderFooter: (activity: Activity) => ReactNode;
}) {
  // Drop target sits on the whole day, so a card lands even on a collapsed or
  // empty day (handleDragEnd reads the `col:<iso>` id → appends to that day).
  const { setNodeRef, isOver } = useDroppable({ id: colId(iso) });

  // Empty day → one thin row, not a full dashed box. A 40-day trip would
  // otherwise be ~40 big boxes to scroll past.
  if (items.length === 0) {
    const label = (
      <>
        <DayName n={n} />
        <span className="truncate">{formatDayLabel(iso)} · nothing planned</span>
        {isToday && <TodayBadge className="ml-auto" />}
      </>
    );
    return (
      <div ref={sectionRef} className="scroll-mt-20">
        {canEdit ? (
          <button
            ref={setNodeRef}
            type="button"
            onClick={onAdd}
            onMouseEnter={onFocus}
            className={cn(
              "flex w-full items-center gap-2 rounded-control border-2 border-dashed border-border/55 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
              isOver && "border-foreground/50 bg-accent/40 text-foreground",
            )}
          >
            <Plus aria-hidden className="size-4 shrink-0 text-[var(--ink-faint)]" />
            {label}
          </button>
        ) : (
          <div
            ref={setNodeRef}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
          >
            {label}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={sectionRef} className="scroll-mt-20">
      <div ref={setNodeRef} className={cn("rounded-card", isOver && "bg-accent/30")}>
        <DayHeader
          n={n}
          iso={iso}
          isToday={isToday}
          count={items.length}
          open={open}
          onToggle={onToggle}
          onFocus={onFocus}
          canEdit={canEdit}
          onAdd={onAdd}
        />
        {open && (
          <SortableContext
            id={colId(iso)}
            items={items.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2 py-1 pl-7">
              {items.map((activity) => (
                <SortableActivityCard
                  key={activity.id}
                  activity={activity}
                  canEdit={canEdit}
                  editingBy={editingHints.get(activity.id)}
                  flash={flashing.has(activity.id)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  footer={renderFooter(activity)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

function DayName({ n }: { n: number | null }) {
  return <span className="font-display font-bold text-foreground">{n ? `Day ${n}` : "Day"}</span>;
}

function TodayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-pill border bg-accent-soft px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-foreground",
        className,
      )}
    >
      Today
    </span>
  );
}

function DayHeader({
  n,
  iso,
  isToday,
  count,
  open,
  onToggle,
  onFocus,
  canEdit,
  onAdd,
}: {
  n: number | null;
  iso: string;
  isToday: boolean;
  count: number;
  open: boolean;
  onToggle: () => void;
  onFocus: () => void;
  canEdit: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={onFocus}
        aria-expanded={open}
        className="flex min-w-0 items-center gap-1.5 rounded-control text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
        <h3 className="truncate font-display text-lg font-bold">
          {n ? `Day ${n}` : "Day"}
          <span className="ml-2 font-body text-sm font-medium text-muted-foreground">
            {formatDayLabel(iso)}
          </span>
        </h3>
      </button>
      {isToday && <TodayBadge />}
      <span className="ml-auto shrink-0 font-medium text-muted-foreground text-xs">
        {count} {count === 1 ? "stop" : "stops"}
      </span>
      {canEdit && (
        <Button size="sm" variant="ghost" className="shrink-0" onClick={onAdd}>
          <Plus aria-hidden />
          Add
        </Button>
      )}
    </div>
  );
}

function DayRail({
  days,
  focusedIso,
  today,
  emptyDays,
  onJump,
}: {
  days: string[];
  focusedIso: string;
  today: string | null;
  emptyDays: Set<string>;
  onJump: (iso: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {days.map((iso) => {
        const focused = iso === focusedIso;
        const empty = emptyDays.has(iso);
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onJump(iso)}
            aria-current={focused ? "true" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-control border-2 px-2.5 py-1 font-body font-semibold text-xs transition-colors",
              focused
                ? "border-border bg-card text-foreground shadow-control"
                : "border-transparent text-muted-foreground hover:text-foreground",
              empty && !focused && "opacity-55",
            )}
          >
            {formatDayShort(iso)}
            {iso === today && (
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--accent-strong)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Flag activities whose `updatedAt` advanced since the last render, briefly, so
 * a remote change draws the eye (PD-5). Seeds silently on first mount — only
 * subsequent changes flash.
 */
function useRecentlyEdited(activities: Activity[]): Set<string> {
  const seen = useRef<Map<string, number>>(new Map());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const changed: string[] = [];
    const present = new Set<string>();
    for (const a of activities) {
      present.add(a.id);
      const prev = seen.current.get(a.id);
      if (prev !== undefined && a.updatedAt > prev) changed.push(a.id);
      seen.current.set(a.id, a.updatedAt);
    }
    for (const id of [...seen.current.keys()]) {
      if (!present.has(id)) seen.current.delete(id);
    }
    if (changed.length === 0) return;

    setFlashing((prev) => new Set([...prev, ...changed]));
    const timer = setTimeout(() => {
      setFlashing((prev) => {
        const next = new Set(prev);
        for (const id of changed) next.delete(id);
        return next;
      });
    }, 1600);
    return () => clearTimeout(timer);
  }, [activities]);

  return flashing;
}

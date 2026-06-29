import {
  type Activity,
  type AnchorRef,
  computeBookingDerivedEntries,
  type DayOverride,
  type DerivedEntry,
  deriveAnchors,
  effectiveRouteMode,
  type GeoPlace,
  type ItemType,
  type MutationPayload,
  positionBetween,
  type RouteMode,
  type TripMember,
  type TripSnapshot,
} from "@caravan/shared";
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
import {
  Building2,
  CalendarRange,
  Car,
  ChevronDown,
  Footprints,
  Home,
  Lightbulb,
  ListChecks,
  MapPin,
  Pencil,
  Plane,
  Plus,
  StickyNote,
  X,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityFooter } from "@/components/decisions/activity-footer";
import {
  commentsFor,
  useCommentsByTarget,
  useMemberColors,
  useMembersById,
  useVotesByActivity,
} from "@/components/decisions/use-decisions";
import { useFocusedDay } from "@/components/map/focused-day";
import { PlaceAutocomplete } from "@/components/map/place-autocomplete";
import { useMapSelection } from "@/components/map/selection";
import { type DayRouteState, useDayRoutes } from "@/components/routing/day-routes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/expenses/money";
import { FALLBACK_PERSON_COLOR } from "@/lib/person-colors";
import { useDays, useIdeaLists, useMyMember, usePresence, useTripMutation } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { ActivityFormDialog } from "./activity-form-dialog";
import { DerivedEntryRow } from "./derived-entry-row";
import { dayNumber, deriveDays, formatDayLabel, formatDayShort, todayIso } from "./format";
import { computeStopNumbers } from "./numbering";
import { RailRow } from "./rail-row";
import { SortableRailRow } from "./sortable-activity-card";
import { TravelLegRow } from "./travel-leg-row";

type EditingHint = { name: string; color: string };

type DialogState =
  | { mode: "create"; defaultDate: string | null; defaultType?: ItemType }
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
  // Per-day metadata (D2) + idea lists (D10) come from the shared sync layer; the
  // form dialog wants the lists for an idea's list assignment, the rail wants
  // each day's subtitle.
  const { daysByDate, upsertDay } = useDays();
  const { ideaLists } = useIdeaLists();
  // V2.5 routing: the per-day drawn routes, computed once by RoutingProvider (at
  // PlanView) and shared with the ambient map. Empty outside that provider (tests,
  // narrow Plan with no map) → the rail just shows no travel-time leg rows.
  const dayRoutes = useDayRoutes();
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

  // V2.4 bookings (flight/lodging) + per-day home-base overrides feed the
  // booking-derived rows and the day anchor chips. `allBookings` spans the whole
  // trip (a booking spawns rows on OTHER days); `dayOverrides` retypes the Day
  // rows to the pure `DayOverride` shape `deriveAnchors` consumes.
  const allBookings = useMemo(
    () => activities.filter((a) => a.type === "flight" || a.type === "lodging"),
    [activities],
  );
  const dayOverrides = useMemo<Map<string, DayOverride>>(
    () => new Map([...daysByDate.values()].map((d) => [d.date, d] as const)),
    [daysByDate],
  );
  // The implicit rows each booking spawns (check-outs, flight arrivals),
  // bucketed by the day they land on.
  const derivedByDate = useMemo(() => {
    const map = new Map<string, DerivedEntry[]>();
    for (const booking of allBookings) {
      for (const entry of computeBookingDerivedEntries(booking)) {
        const arr = map.get(entry.date) ?? [];
        arr.push(entry);
        map.set(entry.date, arr);
      }
    }
    return map;
  }, [allBookings]);

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

  // Stable join-order color map, shared with the feed + Track A surfaces.
  const colors = useMemberColors(snapshot.members);

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
    () =>
      new Set(
        days.filter(
          (iso) =>
            (byDate.get(iso) ?? []).length === 0 && (derivedByDate.get(iso)?.length ?? 0) === 0,
        ),
      ),
    [days, byDate, derivedByDate],
  );
  // Focus is shared with the ambient map (via FocusedDayProvider) so it can
  // frame the focused day's pins — the map lives across a lazy/Suspense boundary
  // in PlanView, so a context beats prop-drilling. Outside a provider (no map,
  // e.g. tests) this is a harmless no-op signal. The shared value starts null;
  // seed it once to the trip's natural starting day (today-in-trip else day 1).
  const { focusedDay, setFocusedDay } = useFocusedDay();
  // Shared with the ambient map too: clicking an activity's title highlights its
  // pin (and flies to it); clicking a pin highlights the card. Toggling the
  // already-selected one clears it. No-op signal outside a provider (tests).
  const { selectedId, select } = useMapSelection();
  const toggleSelect = (id: string) => select(id === selectedId ? null : id);
  const initialFocus = todayInTrip ? today : (days[0] ?? "");
  const focusedIso = focusedDay ?? initialFocus;
  const setFocusedIso = setFocusedDay;
  useEffect(() => {
    if (focusedDay === null && initialFocus) setFocusedDay(initialFocus);
  }, [focusedDay, initialFocus, setFocusedDay]);
  const [collapseOverride, setCollapseOverride] = useState<Record<string, boolean>>({});
  const defaultOpen = (iso: string): boolean =>
    ((byDate.get(iso) ?? []).length > 0 || (derivedByDate.get(iso)?.length ?? 0) > 0) &&
    (!todayInTrip || iso >= today);
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

  const openCreate = (date: string | null, type?: ItemType) =>
    setDialog({ mode: "create", defaultDate: date, defaultType: type });
  const openEdit = (activity: Activity) => setDialog({ mode: "edit", activity });
  // A booking-derived row links back to its source booking (D-anchors) — open
  // that booking in the edit dialog.
  const openBookingById = (bookingId: string) => {
    const booking = activities.find((a) => a.id === bookingId);
    if (booking) openEdit(booking);
  };

  // Per-item optimistic check/uncheck (D1) — addressed by item id so concurrent
  // toggles of different entries converge instead of clobbering.
  const toggleChecklistItem = (activityId: string, itemId: string, done: boolean) =>
    void mutateAsync("checklist.toggle", { activityId, itemId, done }).catch(() => {});

  // Mirror the toolbar's "Add activity" default (first day, or the ideas pool
  // when there are no dated days) so the mobile FAB opens the same dialog.
  useImperativeHandle(handleRef, () => ({
    addActivity: () => openCreate(days[0] ?? null),
  }));
  const remove = (activity: Activity) =>
    void mutateAsync("activity.delete", { activityId: activity.id }).catch(() => {});

  // Inline rail-row edits (cost chip, stop time) write through the same
  // `activity.update` pipeline the ⋯ Edit-details dialog uses — a minimal patch,
  // optimistic. Title stays dialog-only (protects the title→pin select).
  const updateActivity = (activityId: string, patch: MutationPayload<"activity.update">["patch"]) =>
    void mutateAsync("activity.update", { activityId, patch }).catch(() => {});

  // V2.5: the trip-wide default routing mode (days inherit it unless overridden).
  // No trip settings dialog exists yet, so this lives in the Plan toolbar below —
  // the trip-scoped surface next to the per-day overrides in each DayHeader.
  const setDefaultRouteMode = (mode: RouteMode) =>
    void mutateAsync("trip.update", { defaultRouteMode: mode }).catch(() => {});

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
        <div className="cv-card p-8 sm:p-10">
          <EmptyState
            icon={CalendarRange}
            title="Nothing planned yet"
            description="Set the trip dates to lay out days, or drop a first idea in the pool — the group can vote on it later."
            action={
              canEdit ? (
                <Button onClick={() => openCreate(null)}>
                  <Plus aria-hidden />
                  Add an idea
                </Button>
              ) : undefined
            }
          />
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
                <TripRouteModeToggle mode={trip.defaultRouteMode} onChange={setDefaultRouteMode} />
              )}
              {canEdit && (
                // Desktop-only: on mobile the thumb FAB is the sole "add" path,
                // so this would otherwise be a second control with the same
                // accessible name at narrow viewports.
                <Button
                  size="sm"
                  className="hidden shrink-0 lg:inline-flex"
                  onClick={() => openCreate(days[0] ?? null)}
                >
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
                  currency={trip.currency}
                  allBookings={allBookings}
                  dayOverrides={dayOverrides}
                  derived={derivedByDate.get(iso) ?? []}
                  onOpenBooking={openBookingById}
                  onSetHomeBase={(place) =>
                    void upsertDay(iso, { homeBasePlace: place }).catch(() => {})
                  }
                  onClearHomeBase={() =>
                    void upsertDay(iso, { homeBasePlace: null }).catch(() => {})
                  }
                  subtitle={daysByDate.get(iso)?.subtitle ?? null}
                  onSubtitleCommit={(subtitle) => void upsertDay(iso, { subtitle }).catch(() => {})}
                  editingHints={editingHints}
                  flashing={flashing}
                  selectedId={selectedId}
                  onSelectActivity={toggleSelect}
                  membersById={membersById}
                  colors={colors}
                  votesByActivity={votesByActivity}
                  commentsByTarget={commentsByTarget}
                  onAdd={(type) => openCreate(iso, type)}
                  onEdit={openEdit}
                  onDelete={remove}
                  onUpdate={updateActivity}
                  onToggleChecklistItem={toggleChecklistItem}
                  renderFooter={renderFooter}
                  dayRoute={dayRoutes.get(iso)}
                  tripDefaultMode={trip.defaultRouteMode}
                  dayRouteMode={daysByDate.get(iso)?.routeMode ?? null}
                  onSetRouteMode={(mode) =>
                    void upsertDay(iso, { routeMode: mode }).catch(() => {})
                  }
                  onClearRouteMode={() => void upsertDay(iso, { routeMode: null }).catch(() => {})}
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
                <ul className="cv-card list-none bg-card px-2">
                  <RailRow
                    activity={activeActivity}
                    number={
                      computeStopNumbers(byDate.get(activeActivity.date) ?? []).get(
                        activeActivity.id,
                      ) ?? null
                    }
                    isFirst
                    isLast
                    canEdit={false}
                    currency={trip.currency}
                  />
                </ul>
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
        defaultType={dialog?.mode === "create" ? dialog.defaultType : undefined}
        days={days}
        startDate={trip.startDate}
        currency={trip.currency}
        ideaLists={ideaLists}
        mutateAsync={mutateAsync}
        appendPositionFor={appendPositionFor}
      />
    </section>
  );
}

/** One rendered rail row: a real (draggable) activity or a derived display row. */
type DisplayRow =
  | { kind: "activity"; activity: Activity }
  | { kind: "derived"; entry: DerivedEntry };

/** The resolved anchor-chip state for a day's header, or null when there's none. */
type AnchorChipData = {
  placeName: string;
  /** True when the value is this day's manual override (vs a booking-computed one). */
  isOverride: boolean;
  /** Which glyph to lead with — a hotel, a plane, or the home (override) mark. */
  icon: "lodging" | "flight" | "home";
};

/**
 * Interleave a day's booking-derived entries (check-outs, flight arrivals) into
 * its manually-ordered activity rows by time, WITHOUT reordering the activities.
 * The rail is a drag-ordered list and the dnd drop math assumes render order
 * equals `position` order, so activities keep their exact order; each derived
 * entry (a read-only artifact) slots in just before the first activity due at or
 * after it. Remaining derived entries — and all of them when the day's
 * activities are untimed — trail in time order. Null times sort last.
 */
function mergeDayRows(items: Activity[], derived: DerivedEntry[]): DisplayRow[] {
  const sorted = [...derived].sort((a, b) => {
    if (a.time === b.time) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  });

  const rows: DisplayRow[] = [];
  let d = 0;
  for (const activity of items) {
    const at = activity.startTime;
    while (d < sorted.length && at !== null) {
      const next = sorted[d];
      if (!next || next.time === null || next.time > at) break;
      rows.push({ kind: "derived", entry: next });
      d += 1;
    }
    rows.push({ kind: "activity", activity });
  }
  while (d < sorted.length) {
    const next = sorted[d];
    if (next) rows.push({ kind: "derived", entry: next });
    d += 1;
  }
  return rows;
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
  currency,
  allBookings,
  dayOverrides,
  derived,
  onOpenBooking,
  onSetHomeBase,
  onClearHomeBase,
  subtitle,
  onSubtitleCommit,
  editingHints,
  flashing,
  selectedId,
  onSelectActivity,
  membersById,
  colors,
  votesByActivity,
  commentsByTarget,
  onAdd,
  onEdit,
  onDelete,
  onUpdate,
  onToggleChecklistItem,
  renderFooter,
  dayRoute,
  tripDefaultMode,
  dayRouteMode,
  onSetRouteMode,
  onClearRouteMode,
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
  currency: string;
  /** All flight/lodging bookings across the trip (a booking spawns rows + anchors
   * on days other than its own). */
  allBookings: Activity[];
  /** Per-day home-base overrides, keyed by ISO date (override-then-computed). */
  dayOverrides: Map<string, DayOverride>;
  /** The booking-derived rows landing on THIS day (check-outs / arrivals). */
  derived: DerivedEntry[];
  /** Jump to a derived row's source booking (opens the edit dialog). */
  onOpenBooking: (bookingId: string) => void;
  /** Pin this day's home base (writes the override). */
  onSetHomeBase: (place: GeoPlace) => void;
  /** Clear this day's home-base override (back to computed). */
  onClearHomeBase: () => void;
  subtitle: string | null;
  onSubtitleCommit: (subtitle: string | null) => void;
  editingHints: Map<string, EditingHint>;
  flashing: Set<string>;
  selectedId: string | null;
  onSelectActivity: (id: string) => void;
  membersById: Map<string, TripMember>;
  colors: Map<string, string>;
  votesByActivity: Map<string, string[]>;
  commentsByTarget: ReturnType<typeof useCommentsByTarget>;
  onAdd: (type?: ItemType) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  onUpdate: (activityId: string, patch: MutationPayload<"activity.update">["patch"]) => void;
  onToggleChecklistItem: (activityId: string, itemId: string, done: boolean) => void;
  renderFooter: (activity: Activity) => ReactNode;
  /** This day's drawn route (V2.5) — feeds the inter-stop travel-leg rows. */
  dayRoute: DayRouteState | undefined;
  /** Trip-wide default routing mode (for the day toggle's "(trip default)" state). */
  tripDefaultMode: RouteMode;
  /** This day's mode override, or null when inheriting the trip default. */
  dayRouteMode: RouteMode | null;
  /** Pin this day's routing mode (writes the override). */
  onSetRouteMode: (mode: RouteMode) => void;
  /** Clear this day's override (back to the trip default). */
  onClearRouteMode: () => void;
}) {
  // Drop target sits on the whole day, so a row lands even on a collapsed or
  // empty day (handleDragEnd reads the `col:<iso>` id → appends to that day).
  const { setNodeRef, isOver } = useDroppable({ id: colId(iso) });

  // Per-day stop numbers (§C.6) — shared with the map pins. Only dated
  // `activity` items are numbered; notes/checklists are skipped. Recomputed each
  // render from `position` order, so a drag-reorder renumbers the stamps live.
  const stopNumbers = computeStopNumbers(items);
  const stopCount = items.filter((a) => a.type === "activity").length;
  // Bookings carry their own `estimatedCostMinor`, so this total includes them.
  const costTotalMinor = items.reduce((sum, a) => sum + (a.estimatedCostMinor ?? 0), 0);

  // The day's render order: manually-ordered activities with the read-only
  // booking-derived rows woven in by time (the activities keep their order — the
  // dnd math relies on render order == position order, see `mergeDayRows`).
  const rows = mergeDayRows(items, derived);

  // The day's home-base anchor (the chip). `deriveAnchors` already applies the
  // override-then-computed precedence; this day's OWN manual override wins for
  // display since it's exactly what the chip edits/clears.
  const ownOverride = dayOverrides.get(iso);
  const ownHomeBase = ownOverride?.homeBasePlaceName ?? null;
  const anchors = deriveAnchors(allBookings, iso, dayOverrides);

  // V2.5 inter-stop travel legs. The plotted stops are EXACTLY the activity-type
  // items with coordinates, in position order — the same set/order
  // `buildDayWaypoints` threads into the route waypoints `[start?, ...stops, end?]`.
  // A leg sits before plotted stop j (j ≥ 1), describing the hop stop(j-1) → stop(j);
  // that's `legs[legIndexBase + (j - 1)]`, where legIndexBase shifts by 1 when a
  // start anchor bookends the front of the waypoint list.
  const plottedStops = items.filter(
    (a) => a.type === "activity" && a.lat !== null && a.lng !== null,
  );
  const plottedIndex = new Map(plottedStops.map((a, i) => [a.id, i] as const));
  const hasStartAnchor =
    anchors.start != null && anchors.start.lat !== null && anchors.start.lng !== null;
  const legIndexBase = hasStartAnchor ? 1 : 0;
  const routeLegs = dayRoute?.result?.legs ?? null;
  const routeLoading = dayRoute?.isLoading ?? false;
  // Fall back to the computed effective mode when no route has resolved yet, so the
  // leg glyph + directions link still match the day's intended mode.
  const legMode = dayRoute?.mode ?? effectiveRouteMode(tripDefaultMode, dayRouteMode);
  const displayAnchor: AnchorRef | null =
    ownHomeBase !== null && ownOverride
      ? {
          bookingId: null,
          placeName: ownHomeBase,
          lat: ownOverride.homeBaseLat,
          lng: ownOverride.homeBaseLng,
        }
      : (anchors.start ?? anchors.end);
  const anchorBookingId = displayAnchor?.bookingId ?? null;
  const anchorBooking = anchorBookingId
    ? (allBookings.find((b) => b.id === anchorBookingId) ?? null)
    : null;
  const anchorChip: AnchorChipData | null =
    displayAnchor?.placeName != null
      ? {
          placeName: displayAnchor.placeName,
          isOverride: ownHomeBase !== null,
          icon:
            ownHomeBase !== null ? "home" : anchorBooking?.type === "flight" ? "flight" : "lodging",
        }
      : null;

  // Empty day → one thin row, not a full dashed box. A 40-day trip would
  // otherwise be ~40 big boxes to scroll past. A day with only derived rows
  // (e.g. a check-out) is NOT empty — it falls through to the full block.
  if (items.length === 0 && derived.length === 0) {
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
            onClick={() => onAdd()}
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
          stopCount={stopCount}
          costTotalMinor={costTotalMinor}
          currency={currency}
          anchor={anchorChip}
          canClearAnchor={ownHomeBase !== null}
          onSetHomeBase={onSetHomeBase}
          onClearHomeBase={onClearHomeBase}
          subtitle={subtitle}
          onSubtitleCommit={onSubtitleCommit}
          open={open}
          onToggle={onToggle}
          onFocus={onFocus}
          canEdit={canEdit}
          onAdd={onAdd}
          tripDefaultMode={tripDefaultMode}
          dayRouteMode={dayRouteMode}
          onSetRouteMode={onSetRouteMode}
          onClearRouteMode={onClearRouteMode}
        />
        {open && (
          // The SortableContext only knows the real activity ids; the woven-in
          // derived rows render OUTSIDE the sortable (read-only display artifacts).
          <SortableContext
            id={colId(iso)}
            items={items.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            {/* The rail: an ordered list threaded by the connector spine (§C.2).
                No inter-row gap so each row's spine segment meets the next.
                isFirst/isLast span the FULL list so the spine reaches end to end. */}
            <ol className="flex list-none flex-col py-1 pl-1">
              {/* flatMap so a plotted stop can emit a leading TravelLegRow (the hop
                  from the previous plotted stop) ahead of its own row. Intervening
                  notes/checklists/derived rows never add a leg — legs connect only
                  consecutive PLOTTED stops, placed just before the downstream one. */}
              {rows.flatMap((row, index) => {
                const isFirst = index === 0;
                const isLast = index === rows.length - 1;
                if (row.kind === "derived") {
                  return [
                    <DerivedEntryRow
                      key={`derived:${row.entry.sourceBookingId}:${row.entry.kind}`}
                      entry={row.entry}
                      isFirst={isFirst}
                      isLast={isLast}
                      canEdit={canEdit}
                      onOpenBooking={onOpenBooking}
                    />,
                  ];
                }
                const activity = row.activity;
                const addedByMember = membersById.get(activity.createdBy);
                const stopRow = (
                  <SortableRailRow
                    key={activity.id}
                    activity={activity}
                    number={stopNumbers.get(activity.id) ?? null}
                    isFirst={isFirst}
                    isLast={isLast}
                    canEdit={canEdit}
                    currency={currency}
                    voteCount={votesByActivity.get(activity.id)?.length ?? 0}
                    commentCount={commentsFor(commentsByTarget, "activity", activity.id).length}
                    addedBy={
                      addedByMember
                        ? {
                            name: addedByMember.name,
                            color: colors.get(activity.createdBy) ?? FALLBACK_PERSON_COLOR,
                          }
                        : undefined
                    }
                    editingBy={editingHints.get(activity.id)}
                    flash={flashing.has(activity.id)}
                    selected={activity.id === selectedId}
                    onSelect={() => onSelectActivity(activity.id)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onUpdate={(patch) => onUpdate(activity.id, patch)}
                    onToggleChecklistItem={(itemId, done) =>
                      onToggleChecklistItem(activity.id, itemId, done)
                    }
                    footer={renderFooter(activity)}
                  />
                );
                const j = plottedIndex.get(activity.id);
                const prev = j !== undefined && j >= 1 ? plottedStops[j - 1] : undefined;
                if (j !== undefined && prev) {
                  const legRow = (
                    <TravelLegRow
                      key={`leg:${prev.id}:${activity.id}`}
                      leg={routeLegs ? (routeLegs[legIndexBase + (j - 1)] ?? null) : null}
                      isLoading={routeLoading}
                      fromCoord={{ lat: prev.lat as number, lng: prev.lng as number }}
                      toCoord={{ lat: activity.lat as number, lng: activity.lng as number }}
                      mode={legMode}
                      canEdit={canEdit}
                    />
                  );
                  return [legRow, stopRow];
                }
                return [stopRow];
              })}
            </ol>
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
  stopCount,
  costTotalMinor,
  currency,
  anchor,
  canClearAnchor,
  onSetHomeBase,
  onClearHomeBase,
  subtitle,
  onSubtitleCommit,
  open,
  onToggle,
  onFocus,
  canEdit,
  onAdd,
  tripDefaultMode,
  dayRouteMode,
  onSetRouteMode,
  onClearRouteMode,
}: {
  n: number | null;
  iso: string;
  isToday: boolean;
  stopCount: number;
  costTotalMinor: number;
  currency: string;
  anchor: AnchorChipData | null;
  canClearAnchor: boolean;
  onSetHomeBase: (place: GeoPlace) => void;
  onClearHomeBase: () => void;
  subtitle: string | null;
  onSubtitleCommit: (subtitle: string | null) => void;
  open: boolean;
  onToggle: () => void;
  onFocus: () => void;
  canEdit: boolean;
  onAdd: (type?: ItemType) => void;
  tripDefaultMode: RouteMode;
  dayRouteMode: RouteMode | null;
  onSetRouteMode: (mode: RouteMode) => void;
  onClearRouteMode: () => void;
}) {
  return (
    <div className="group/day py-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          onMouseEnter={onFocus}
          aria-expanded={open}
          className="flex min-w-0 shrink items-center gap-1.5 rounded-control text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <h3 className="truncate font-display text-lg font-bold">
            {formatDayLabel(iso)}
            {n != null && (
              <span className="ml-2 font-body text-sm font-medium text-muted-foreground">
                Day {n}
              </span>
            )}
          </h3>
        </button>
        <DaySubtitle subtitle={subtitle} canEdit={canEdit} onCommit={onSubtitleCommit} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isToday && <TodayBadge />}
          {canEdit && <DayAddMenu onAdd={onAdd} />}
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs">
        <AnchorChip
          anchor={anchor}
          canEdit={canEdit}
          canClear={canClearAnchor}
          onSetHomeBase={onSetHomeBase}
          onClearHomeBase={onClearHomeBase}
        />
        <p className="font-medium text-muted-foreground">
          {stopCount} {stopCount === 1 ? "stop" : "stops"}
          {costTotalMinor > 0 && ` · ~${formatMoney(costTotalMinor, currency)} est`}
        </p>
        <DayRouteModeToggle
          tripDefaultMode={tripDefaultMode}
          dayRouteMode={dayRouteMode}
          canEdit={canEdit}
          onSet={onSetRouteMode}
          onClear={onClearRouteMode}
        />
      </div>
    </div>
  );
}

/**
 * The day's home-base anchor chip (V2.4 D-anchors). Shows where you slept:
 * muted + a hotel/Plane glyph when booking-computed, normal weight + a Pencil
 * when this day carries a manual override (with an × to clear on hover). Clicking
 * opens an inline `PlaceAutocomplete` — picking a suggestion writes the override
 * via `onSetHomeBase`. With no anchor at all, editors get a hover-revealed
 * "+ set home base" affordance; viewers see nothing. Mirrors the DaySubtitle
 * inline-edit idiom (click → input, Esc / click-away cancels).
 */
function AnchorChip({
  anchor,
  canEdit,
  canClear,
  onSetHomeBase,
  onClearHomeBase,
}: {
  anchor: AnchorChipData | null;
  canEdit: boolean;
  canClear: boolean;
  onSetHomeBase: (place: GeoPlace) => void;
  onClearHomeBase: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  function begin() {
    if (!canEdit) return;
    setDraft(anchor?.placeName ?? "");
    setEditing(true);
  }

  if (editing) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: focus-trap wrapper for the inline home-base editor — Escape/blur dismiss it; the interactive control is the PlaceAutocomplete within
      <div
        ref={wrapRef}
        className="w-60"
        onBlur={(e) => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      >
        <PlaceAutocomplete
          value={draft}
          picked={false}
          placeholder="Set a home base for this day"
          onTextChange={setDraft}
          onPick={(place) => {
            onSetHomeBase(place);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  if (!anchor) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={begin}
        className="flex items-center gap-1 rounded-pill px-1.5 py-0.5 font-medium text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-focus-within/day:opacity-100 group-hover/day:opacity-100"
      >
        <Home aria-hidden className="size-3.5 shrink-0" />+ set home base
      </button>
    );
  }

  const Icon = anchor.icon === "flight" ? Plane : anchor.icon === "home" ? Home : Building2;
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={begin}
        disabled={!canEdit}
        title={canEdit ? "Set this day's home base" : undefined}
        aria-label={`Home base: ${anchor.placeName}`}
        className={cn(
          "flex max-w-[12rem] items-center gap-1 rounded-pill px-1.5 py-0.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
          canEdit && "hover:bg-accent-soft",
          anchor.isOverride ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{anchor.placeName}</span>
        {anchor.isOverride && <Pencil aria-hidden className="size-3 shrink-0 opacity-70" />}
      </button>
      {canClear && canEdit && (
        <button
          type="button"
          onClick={onClearHomeBase}
          aria-label="Clear home base"
          title="Clear home base"
          className="rounded-full p-0.5 text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-focus-within/day:opacity-100 group-hover/day:opacity-100"
        >
          <X aria-hidden className="size-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Per-day routing-mode toggle (V2.5). A compact walk/drive segmented control by
 * the anchor chip: it reflects the EFFECTIVE mode (trip default ⊕ this day's
 * override). With no override it shows a muted "(trip default)"; picking a mode
 * pins it for the day (writes `routeMode`), and a hover × clears back to the
 * default. Editor-gated — viewers get a small read-only mode indicator. Mirrors
 * the AnchorChip inline idiom (and rides the same `group/day` hover-reveal).
 */
function DayRouteModeToggle({
  tripDefaultMode,
  dayRouteMode,
  canEdit,
  onSet,
  onClear,
}: {
  tripDefaultMode: RouteMode;
  dayRouteMode: RouteMode | null;
  canEdit: boolean;
  onSet: (mode: RouteMode) => void;
  onClear: () => void;
}) {
  const effective = effectiveRouteMode(tripDefaultMode, dayRouteMode);
  const isDefault = dayRouteMode === null;

  if (!canEdit) {
    const Icon = effective === "driving" ? Car : Footprints;
    return (
      <span
        className="flex items-center gap-1 font-medium text-muted-foreground"
        title={`Routes by ${effective}`}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
        <span className="capitalize">{effective}</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span
        role="toolbar"
        aria-label="Travel mode for this day's route"
        className="flex items-center rounded-pill border bg-card p-0.5"
      >
        {(["walking", "driving"] as const).map((m) => {
          const Icon = m === "driving" ? Car : Footprints;
          const active = effective === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSet(m)}
              aria-pressed={active}
              aria-label={m === "walking" ? "Walk this day" : "Drive this day"}
              title={m === "walking" ? "Walk" : "Drive"}
              className={cn(
                "flex items-center rounded-pill px-1.5 py-0.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active
                  ? "bg-accent-soft text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
            </button>
          );
        })}
      </span>
      {isDefault ? (
        <span className="text-[11px] text-muted-foreground">(trip default)</span>
      ) : (
        <button
          type="button"
          onClick={onClear}
          aria-label="Use the trip's default travel mode"
          title="Use trip default"
          className="rounded-full p-0.5 text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-focus-within/day:opacity-100 group-hover/day:opacity-100"
        >
          <X aria-hidden className="size-3" />
        </button>
      )}
    </span>
  );
}

/**
 * The trip-wide default routing mode (V2.5) — a compact walk/drive segmented
 * control in the Plan toolbar. Days inherit this unless they pin an override (see
 * `DayRouteModeToggle`). Editor-only; writes `trip.defaultRouteMode`. (No trip
 * settings dialog exists yet, so the Plan toolbar is its trip-scoped home.)
 */
function TripRouteModeToggle({
  mode,
  onChange,
}: {
  mode: RouteMode;
  onChange: (mode: RouteMode) => void;
}) {
  return (
    <span
      role="toolbar"
      aria-label="Default travel mode for routes"
      className="hidden shrink-0 items-center rounded-control border bg-card p-0.5 shadow-control sm:flex"
    >
      {(["walking", "driving"] as const).map((m) => {
        const Icon = m === "driving" ? Car : Footprints;
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            aria-label={
              m === "walking" ? "Default travel mode: walking" : "Default travel mode: driving"
            }
            title={m === "walking" ? "Routes default to walking" : "Routes default to driving"}
            className={cn(
              "flex items-center rounded-control px-2 py-1 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" strokeWidth={2.25} />
          </button>
        );
      })}
    </span>
  );
}

/** Inline-editable per-day subtitle (D2). Mirrors `TripNameEditor`: click → input,
 * Enter commits, Esc cancels, blur commits. Writes through `upsertDay`. */
function DaySubtitle({
  subtitle,
  canEdit,
  onCommit,
}: {
  subtitle: string | null;
  canEdit: boolean;
  onCommit: (subtitle: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter commits, then blur fires as the input unmounts — settle exactly once.
  const doneRef = useRef(false);

  function begin() {
    if (!canEdit) return;
    setDraft(subtitle ?? "");
    doneRef.current = false;
    setEditing(true);
  }
  function finish(save: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed.length ? trimmed : null;
    if (save && next !== subtitle && trimmed.length <= 120) onCommit(next);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        maxLength={120}
        aria-label="Day subtitle"
        placeholder="Add a subtitle"
        className="h-7 max-w-[16rem] text-sm"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          else if (e.key === "Escape") finish(false);
        }}
      />
    );
  }

  if (!subtitle && !canEdit) return null;

  if (!canEdit) {
    return (
      <span className="min-w-0 truncate text-muted-foreground text-sm italic">{subtitle}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      title="Set a subtitle for this day"
      className="flex min-w-0 items-center gap-1 truncate rounded-sm text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          "min-w-0 truncate underline decoration-dotted underline-offset-2",
          subtitle ? "text-foreground" : "text-muted-foreground italic",
        )}
      >
        {subtitle ?? "Add a subtitle"}
      </span>
      <Pencil aria-hidden className="size-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** The day's "Add" — offers a stop, a note, or a checklist (§C.1 / D.1). Each
 * opens `ActivityFormDialog` with the right `defaultType` + day. */
function DayAddMenu({
  onAdd,
  className,
}: {
  onAdd: (type?: ItemType) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className={cn("shrink-0", className)}>
          <Plus aria-hidden />
          Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAdd("activity")}>
          <MapPin aria-hidden />
          Add stop
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAdd("note")}>
          <StickyNote aria-hidden />
          Add note
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAdd("checklist")}>
          <ListChecks aria-hidden />
          Add checklist
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAdd("flight")}>
          <Plane aria-hidden />
          Add flight
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAdd("lodging")}>
          <Building2 aria-hidden />
          Add lodging
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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

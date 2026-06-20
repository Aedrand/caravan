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
import { Lightbulb, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FALLBACK_PERSON_COLOR, personColors } from "@/lib/person-colors";
import { useMyMember, usePresence, useTripMutation } from "@/lib/sync";
import { ActivityCard } from "./activity-card";
import { ActivityFormDialog } from "./activity-form-dialog";
import { dayNumber, deriveDays, formatDayLabel } from "./format";
import { SortableActivityCard } from "./sortable-activity-card";

type EditingHint = { name: string; color: string };

type DialogState =
  | { mode: "create"; defaultDate: string | null }
  | { mode: "edit"; activity: Activity }
  | null;

const IDEAS = "col:ideas";
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

export function ItineraryBoard({
  snapshot,
  canEdit,
}: {
  snapshot: TripSnapshot;
  canEdit: boolean;
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
  const ideas = byDate.get(null) ?? [];
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
  const remove = (activity: Activity) =>
    void mutateAsync("activity.delete", { activityId: activity.id }).catch(() => {});

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
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Itinerary</h2>
        {canEdit && (
          <Button size="sm" onClick={() => openCreate(days[0] ?? null)}>
            <Plus aria-hidden />
            Add activity
          </Button>
        )}
      </div>

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {days.map((iso) => (
            <DaySection
              key={iso}
              iso={iso}
              n={dayNumber(iso, trip.startDate)}
              items={byDate.get(iso) ?? []}
              canEdit={canEdit}
              editingHints={editingHints}
              flashing={flashing}
              onAdd={() => openCreate(iso)}
              onEdit={openEdit}
              onDelete={remove}
            />
          ))}

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lightbulb aria-hidden className="size-5 text-[var(--accent-strong)]" />
                <h3 className="font-display text-lg font-bold">Ideas</h3>
                {ideas.length > 0 && (
                  <span className="text-sm font-medium text-muted-foreground">{ideas.length}</span>
                )}
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => openCreate(null)}>
                  <Plus aria-hidden />
                  Add idea
                </Button>
              )}
            </div>
            <ActivityColumn
              containerId={IDEAS}
              items={ideas}
              canEdit={canEdit}
              editingHints={editingHints}
              flashing={flashing}
              emptyLabel="No ideas yet"
              onAdd={() => openCreate(null)}
              onEdit={openEdit}
              onDelete={remove}
            />
          </section>

          <DragOverlay>
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

function DaySection({
  iso,
  n,
  items,
  canEdit,
  editingHints,
  flashing,
  onAdd,
  onEdit,
  onDelete,
}: {
  iso: string;
  n: number | null;
  items: Activity[];
  canEdit: boolean;
  editingHints: Map<string, EditingHint>;
  flashing: Set<string>;
  onAdd: () => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold">
          {n ? `Day ${n}` : "Day"}
          <span className="ml-2 font-body text-sm font-medium text-muted-foreground">
            {formatDayLabel(iso)}
          </span>
        </h3>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={onAdd}>
            <Plus aria-hidden />
            Add
          </Button>
        )}
      </div>
      <ActivityColumn
        containerId={colId(iso)}
        items={items}
        canEdit={canEdit}
        editingHints={editingHints}
        flashing={flashing}
        emptyLabel="Nothing planned yet"
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </section>
  );
}

function ActivityColumn({
  containerId,
  items,
  canEdit,
  editingHints,
  flashing,
  emptyLabel,
  onAdd,
  onEdit,
  onDelete,
}: {
  containerId: string;
  items: Activity[];
  canEdit: boolean;
  editingHints: Map<string, EditingHint>;
  flashing: Set<string>;
  emptyLabel: string;
  onAdd: () => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}) {
  const { setNodeRef } = useDroppable({ id: containerId });
  return (
    <SortableContext
      id={containerId}
      items={items.map((a) => a.id)}
      strategy={verticalListSortingStrategy}
    >
      <div ref={setNodeRef} className="flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyColumn canEdit={canEdit} label={emptyLabel} onAdd={onAdd} />
        ) : (
          items.map((activity) => (
            <SortableActivityCard
              key={activity.id}
              activity={activity}
              canEdit={canEdit}
              editingBy={editingHints.get(activity.id)}
              flash={flashing.has(activity.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </SortableContext>
  );
}

function EmptyColumn({
  canEdit,
  label,
  onAdd,
}: {
  canEdit: boolean;
  label: string;
  onAdd: () => void;
}) {
  if (!canEdit) {
    return <p className="px-1 text-sm text-muted-foreground">{label}.</p>;
  }
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-border/60 px-4 py-5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      <Plus aria-hidden className="size-4" />
      Add something
    </button>
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

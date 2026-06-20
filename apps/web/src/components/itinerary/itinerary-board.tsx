import { type Activity, positionBetween, type TripSnapshot } from "@caravan/shared";
import { Lightbulb, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTripMutation } from "@/lib/sync";
import { ActivityCard } from "./activity-card";
import { ActivityFormDialog } from "./activity-form-dialog";
import { dayNumber, deriveDays, formatDayLabel } from "./format";

type DialogState =
  | { mode: "create"; defaultDate: string | null }
  | { mode: "edit"; activity: Activity }
  | null;

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

  const days = useMemo(
    () => deriveDays(trip.startDate, trip.endDate, activities),
    [trip.startDate, trip.endDate, activities],
  );
  const byDate = useMemo(() => groupByDate(activities), [activities]);
  const ideas = byDate.get(null) ?? [];

  const appendPositionFor = (date: string | null): string => {
    const last = (byDate.get(date) ?? []).at(-1)?.position ?? null;
    return positionBetween(last, null);
  };

  const openCreate = (date: string | null) => setDialog({ mode: "create", defaultDate: date });
  const openEdit = (activity: Activity) => setDialog({ mode: "edit", activity });
  const remove = (activity: Activity) =>
    void mutateAsync("activity.delete", { activityId: activity.id }).catch(() => {});

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
        <>
          {days.map((iso) => (
            <DaySection
              key={iso}
              iso={iso}
              n={dayNumber(iso, trip.startDate)}
              activities={byDate.get(iso) ?? []}
              canEdit={canEdit}
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
            {ideas.length === 0 ? (
              <EmptyColumn canEdit={canEdit} label="No ideas yet" onAdd={() => openCreate(null)} />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {ideas.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    canEdit={canEdit}
                    onEdit={openEdit}
                    onDelete={remove}
                  />
                ))}
              </div>
            )}
          </section>
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

function DaySection({
  iso,
  n,
  activities,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  iso: string;
  n: number | null;
  activities: Activity[];
  canEdit: boolean;
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
      {activities.length === 0 ? (
        <EmptyColumn canEdit={canEdit} label="Nothing planned yet" onAdd={onAdd} />
      ) : (
        <div className="flex flex-col gap-2">
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              canEdit={canEdit}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
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

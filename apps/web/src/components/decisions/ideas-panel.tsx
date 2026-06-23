import { type Activity, positionBetween, type TripSnapshot } from "@caravan/shared";
import { Lightbulb, Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { ActivityCard } from "@/components/itinerary/activity-card";
import { ActivityFormDialog } from "@/components/itinerary/activity-form-dialog";
import { deriveDays } from "@/components/itinerary/format";
import { Button } from "@/components/ui/button";
import { useMyMember, useTripMutation } from "@/lib/sync";
import { ActivityFooter } from "./activity-footer";
import {
  commentsFor,
  useCommentsByTarget,
  useMemberColors,
  useMembersById,
  useVotesByActivity,
} from "./use-decisions";

type DialogState =
  | { mode: "create"; defaultDate: string | null }
  | { mode: "edit"; activity: Activity }
  | null;

/**
 * The ideas pool, now living in Decide (C.4): undated candidate activities the
 * group floats and votes on, most-wanted first. The Plan view keeps only a
 * pointer here — voting is the job, so it sits beside the polls. Reuses the
 * itinerary's ActivityCard + the vote/comment footer; "add to a day" is the
 * card's Edit → Day. (Cross-day drag stays in Plan; ideas move via the menu.)
 */
export function IdeasPanel({ snapshot, canEdit }: { snapshot: TripSnapshot; canEdit: boolean }) {
  const { trip, activities } = snapshot;
  const { mutateAsync } = useTripMutation();
  const me = useMyMember();
  const [dialog, setDialog] = useState<DialogState>(null);

  const days = useMemo(
    () => deriveDays(trip.startDate, trip.endDate, activities),
    [trip.startDate, trip.endDate, activities],
  );

  const votesByActivity = useVotesByActivity(snapshot.votes);
  const commentsByTarget = useCommentsByTarget(snapshot.comments);
  const membersById = useMembersById(snapshot.members);
  const colors = useMemberColors(snapshot.members);

  // Undated candidates, most-wanted first (ties keep fractional order — PD-2).
  const ideas = useMemo(() => {
    const pool = activities.filter((a) => a.date === null);
    pool.sort((a, b) => {
      const va = votesByActivity.get(a.id)?.length ?? 0;
      const vb = votesByActivity.get(b.id)?.length ?? 0;
      if (va !== vb) return vb - va;
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
    });
    return pool;
  }, [activities, votesByActivity]);

  const appendPositionFor = (date: string | null): string => {
    const inDate = activities
      .filter((a) => a.date === date)
      .sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : 0));
    return positionBetween(inDate.at(-1)?.position ?? null, null);
  };

  const openCreate = () => setDialog({ mode: "create", defaultDate: null });
  const openEdit = (activity: Activity) => setDialog({ mode: "edit", activity });
  const remove = (activity: Activity) =>
    void mutateAsync("activity.delete", { activityId: activity.id }).catch(() => {});

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

  // The top idea is "most wanted" only once it's actually pulled ahead on votes.
  const topVotes = ideas[0] ? (votesByActivity.get(ideas[0].id)?.length ?? 0) : 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb aria-hidden className="size-5 text-[var(--accent-strong)]" />
          <h2 className="font-display text-xl font-bold">Ideas pool</h2>
          {ideas.length > 0 && (
            <span className="text-sm font-medium text-muted-foreground">{ideas.length}</span>
          )}
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus aria-hidden />
            Add idea
          </Button>
        )}
      </div>

      {ideas.length === 0 ? (
        <div className="cv-card flex flex-col items-center gap-2 p-8 text-center">
          <p className="font-display text-lg font-bold">No ideas yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Float a place or plan the group can vote on — the favorites become days on the trip.
          </p>
        </div>
      ) : (
        <>
          <p className="-mt-1 text-sm text-muted-foreground">
            Most-wanted first. Vote freely; open an idea to drop it on a day.
          </p>
          <ul className="flex flex-col gap-3">
            {ideas.map((activity, rank) => {
              const votes = votesByActivity.get(activity.id)?.length ?? 0;
              const mostWanted = rank === 0 && ideas.length > 1 && votes > 0 && votes === topVotes;
              return (
                <li key={activity.id} className="relative">
                  {mostWanted && (
                    <span className="-top-2 absolute left-4 z-10 rounded-pill border bg-accent-strong px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-[var(--on-primary)] shadow-control">
                      Most wanted
                    </span>
                  )}
                  <ActivityCard
                    activity={activity}
                    canEdit={canEdit}
                    onEdit={openEdit}
                    onDelete={remove}
                    footer={renderFooter(activity)}
                  />
                </li>
              );
            })}
          </ul>
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

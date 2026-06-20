import {
  createId,
  POLL_OPTION_MAX,
  type PollWithDetails,
  positionBetween,
  type TripMember,
  type TripSnapshot,
} from "@caravan/shared";
import { Check, ChevronDown, Lock, MessageSquare, Plus, Sparkles } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/relative-time";
import { useMyMember, useTripMutation } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { AvatarStack } from "./avatar-stack";
import { CommentThread } from "./comment-thread";
import { PollCreateDialog } from "./poll-create-dialog";
import {
  commentsFor,
  myPollVotes,
  pollTally,
  useCommentsByTarget,
  useMemberColors,
  useMembersById,
} from "./use-decisions";

/**
 * The Polls panel (A.2-A.4 / PD-3, PD-4): a stacked section listing every poll
 * with live results, voting, member-added options, close, and convert-to-idea.
 * Mounted on the trip route as a sibling `<section>` — no layout rework.
 */
export function PollsPanel({ snapshot, canEdit }: { snapshot: TripSnapshot; canEdit: boolean }) {
  const me = useMyMember();
  const colors = useMemberColors(snapshot.members);
  const membersById = useMembersById(snapshot.members);
  const commentsByTarget = useCommentsByTarget(snapshot.comments);
  const [createOpen, setCreateOpen] = useState(false);

  const polls = useMemo(
    () => [...snapshot.polls].sort((a, b) => b.createdAt - a.createdAt),
    [snapshot.polls],
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Polls</h2>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            New poll
          </Button>
        )}
      </div>

      {polls.length === 0 ? (
        <div className="cv-card flex flex-col items-center gap-2 p-8 text-center">
          <p className="font-display text-lg font-bold">No polls yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Stuck on a question the itinerary can't answer — which week, which Airbnb? Put it to a
            vote.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              me={me}
              canEdit={canEdit}
              membersById={membersById}
              colors={colors}
              comments={commentsFor(commentsByTarget, "poll", poll.id)}
              activityPositionForIdeas={() => positionBetween(null, null)}
            />
          ))}
        </div>
      )}

      <PollCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}

function PollCard({
  poll,
  me,
  canEdit,
  membersById,
  colors,
  comments,
  activityPositionForIdeas,
}: {
  poll: PollWithDetails;
  me: TripMember | null;
  canEdit: boolean;
  membersById: Map<string, TripMember>;
  colors: Map<string, string>;
  comments: ReturnType<typeof commentsFor>;
  activityPositionForIdeas: () => string;
}) {
  const { mutateAsync } = useTripMutation();
  const [showComments, setShowComments] = useState(false);

  const tally = pollTally(poll);
  const mine = myPollVotes(poll, me?.id);
  const totalVoters = new Set(poll.votes.map((v) => v.memberId)).size;
  const closed = poll.closedAt !== null;
  const isCreator = me?.id === poll.createdBy;
  const isOwner = me?.role === "owner";
  const canClose = canEdit && !closed && (isCreator || isOwner);
  const canConvert =
    canEdit && closed && poll.convertedActivityId === null && poll.votes.length > 0;
  const canAddOption =
    canEdit && !closed && (poll.allowMemberOptions || isCreator) && poll.options.length < 20;

  const vote = (optionId: string) => {
    if (!canEdit || closed) return;
    let next: string[];
    if (poll.multiSelect) {
      next = mine.has(optionId) ? [...mine].filter((id) => id !== optionId) : [...mine, optionId];
    } else {
      next = mine.has(optionId) ? [] : [optionId];
    }
    void mutateAsync("poll.vote", { pollId: poll.id, optionIds: next }).catch(() => {});
  };

  const close = () => void mutateAsync("poll.close", { pollId: poll.id }).catch(() => {});
  const convert = () =>
    void mutateAsync("poll.convert", {
      pollId: poll.id,
      activityId: createId(),
      position: activityPositionForIdeas(),
    }).catch(() => {});

  return (
    <article className="cv-card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold leading-snug">{poll.question}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{relativeTime(poll.createdAt)}</span>
            <span aria-hidden>·</span>
            <span>{poll.multiSelect ? "Pick any" : "Pick one"}</span>
            <span aria-hidden>·</span>
            <span>
              {totalVoters} {totalVoters === 1 ? "voter" : "voters"}
            </span>
            {closed && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Lock aria-hidden className="size-3" />
                Closed
              </span>
            )}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {poll.options.map((option) => {
          const voters = tally.get(option.id) ?? [];
          const chosen = mine.has(option.id);
          const pct = totalVoters === 0 ? 0 : Math.round((voters.length / totalVoters) * 100);
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => vote(option.id)}
                disabled={!canEdit || closed}
                aria-pressed={chosen}
                className={cn(
                  "relative w-full overflow-hidden rounded-control border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  chosen ? "border-primary" : "border-border",
                  canEdit && !closed && "hover:border-foreground/40",
                  (!canEdit || closed) && "cursor-default",
                )}
              >
                {/* Result bar */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-primary/10"
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        chosen
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {chosen && <Check aria-hidden className="size-3" />}
                    </span>
                    <span className="truncate text-sm font-medium">{option.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <AvatarStack
                      memberIds={voters}
                      membersById={membersById}
                      colors={colors}
                      size="xs"
                      max={4}
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {canAddOption && <AddOptionRow pollId={poll.id} />}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
          className="inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <MessageSquare aria-hidden className="size-3.5" />
          {comments.length > 0
            ? `${comments.length} comment${comments.length === 1 ? "" : "s"}`
            : "Comment"}
        </button>
        <span className="flex-1" />
        {canClose && (
          <Button size="xs" variant="outline" onClick={close}>
            <Lock aria-hidden />
            Close poll
          </Button>
        )}
        {canConvert && (
          <Button size="xs" onClick={convert}>
            <Sparkles aria-hidden />
            Make winner an idea
          </Button>
        )}
        {poll.convertedActivityId !== null && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <ChevronDown aria-hidden className="size-3 rotate-[-90deg]" />
            Added to Ideas
          </span>
        )}
      </div>

      {showComments && (
        <div className="border-t border-border/60 pt-3">
          <CommentThread
            targetType="poll"
            targetId={poll.id}
            comments={comments}
            membersById={membersById}
            colors={colors}
            myMember={me}
            canComment={canEdit}
          />
        </div>
      )}
    </article>
  );
}

function AddOptionRow({ pollId }: { pollId: string }) {
  const { mutateAsync } = useTripMutation();
  const [label, setLabel] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    void mutateAsync("poll.addOption", { pollId, optionId: createId(), label: trimmed }).catch(
      () => {},
    );
    setLabel("");
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        value={label}
        maxLength={POLL_OPTION_MAX}
        placeholder="Add an option"
        aria-label="Add an option"
        className="h-8"
        onChange={(e) => setLabel(e.target.value)}
      />
      <Button type="submit" size="xs" variant="ghost" disabled={!label.trim()}>
        <Plus aria-hidden />
        Add
      </Button>
    </form>
  );
}

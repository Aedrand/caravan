import type { TripMember } from "@caravan/shared";
import { ThumbsUp } from "lucide-react";
import { useTripMutation } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { AvatarStack } from "./avatar-stack";

/**
 * The compact "I'm in" vote control (A.1 / PD-2): a single positive toggle per
 * member, with voters shown as avatars (not just a count). Sits on both ideas
 * and scheduled activity cards.
 */
export function VoteControl({
  activityId,
  voterIds,
  myMemberId,
  canVote,
  membersById,
  colors,
}: {
  activityId: string;
  voterIds: string[];
  myMemberId: string | undefined;
  canVote: boolean;
  membersById: Map<string, TripMember>;
  colors: Map<string, string>;
}) {
  const { mutateAsync } = useTripMutation();
  const voted = myMemberId ? voterIds.includes(myMemberId) : false;
  const count = voterIds.length;

  const toggle = () => void mutateAsync("vote.toggle", { activityId }).catch(() => {});

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={canVote ? toggle : undefined}
        disabled={!canVote}
        aria-pressed={voted}
        aria-label={voted ? "Remove your vote" : "Vote: I'm in"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold transition-colors",
          voted
            ? "border-transparent bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground",
          canVote && !voted && "hover:border-foreground/40 hover:text-foreground",
          !canVote && "cursor-default opacity-80",
        )}
      >
        <ThumbsUp aria-hidden className={cn("size-3.5", voted && "fill-current")} />
        {voted ? "I'm in" : "I'm in?"}
        {count > 0 && <span className="tabular-nums">· {count}</span>}
      </button>
      <AvatarStack memberIds={voterIds} membersById={membersById} colors={colors} size="xs" />
    </div>
  );
}

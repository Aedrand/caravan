import type { Comment, TripMember } from "@caravan/shared";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CommentThread } from "./comment-thread";
import { VoteControl } from "./vote-control";

/**
 * The Track A rail under an activity card: the "I'm in" vote control with voter
 * avatars (PD-2) and an expandable comment thread (PD-4). Rendered into the
 * ActivityCard's `footer` slot so the itinerary card stays otherwise untouched.
 */
export function ActivityFooter({
  activityId,
  voterIds,
  comments,
  myMember,
  canEdit,
  membersById,
  colors,
}: {
  activityId: string;
  voterIds: string[];
  comments: Comment[];
  myMember: TripMember | null;
  canEdit: boolean;
  membersById: Map<string, TripMember>;
  colors: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const count = comments.length;

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VoteControl
          activityId={activityId}
          voterIds={voterIds}
          myMemberId={myMember?.id}
          canVote={canEdit}
          membersById={membersById}
          colors={colors}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            count > 0 ? "text-foreground" : "text-muted-foreground",
            "hover:text-foreground",
          )}
        >
          <MessageSquare aria-hidden className="size-3.5" />
          {count > 0 ? `${count} comment${count === 1 ? "" : "s"}` : "Comment"}
        </button>
      </div>
      {open && (
        <CommentThread
          targetType="activity"
          targetId={activityId}
          comments={comments}
          membersById={membersById}
          colors={colors}
          myMember={myMember}
          canComment={canEdit}
        />
      )}
    </div>
  );
}

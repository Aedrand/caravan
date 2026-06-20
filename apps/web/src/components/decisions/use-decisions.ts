import type { ActivityVote, Comment, PollWithDetails, TripMember } from "@caravan/shared";
import { useMemo } from "react";
import { personColors } from "@/lib/person-colors";

/**
 * Shared selectors for Track A surfaces. The trip snapshot carries the flat
 * `votes`, `comments`, and `polls` arrays; these memoized helpers index them
 * the way the vote control, comment threads, and polls panel each need.
 */

/** Stable join-order color map for the trip's active members (mirrors the feed/itinerary). */
export function useMemberColors(members: TripMember[]): Map<string, string> {
  return useMemo(
    () =>
      personColors(
        members.filter((m) => m.status === "active").sort((a, b) => a.joinedAt - b.joinedAt),
      ),
    [members],
  );
}

export function useMembersById(members: TripMember[]): Map<string, TripMember> {
  return useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
}

/** activityId → voter membership ids (oldest first). */
export function useVotesByActivity(votes: ActivityVote[]): Map<string, string[]> {
  return useMemo(() => {
    const ordered = [...votes].sort((a, b) => a.createdAt - b.createdAt);
    const map = new Map<string, string[]>();
    for (const v of ordered) {
      const arr = map.get(v.activityId) ?? [];
      arr.push(v.memberId);
      map.set(v.activityId, arr);
    }
    return map;
  }, [votes]);
}

/** (targetType:targetId) → comments, oldest first. */
function commentKey(targetType: "activity" | "poll", targetId: string): string {
  return `${targetType}:${targetId}`;
}

export function useCommentsByTarget(comments: Comment[]): Map<string, Comment[]> {
  return useMemo(() => {
    const ordered = [...comments].sort((a, b) => a.createdAt - b.createdAt);
    const map = new Map<string, Comment[]>();
    for (const c of ordered) {
      const key = commentKey(c.targetType, c.targetId);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [comments]);
}

export function commentsFor(
  byTarget: Map<string, Comment[]>,
  targetType: "activity" | "poll",
  targetId: string,
): Comment[] {
  return byTarget.get(commentKey(targetType, targetId)) ?? [];
}

/** Vote tallies for a poll: optionId → voter membership ids. */
export function pollTally(poll: PollWithDetails): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const option of poll.options) map.set(option.id, []);
  for (const vote of poll.votes) {
    const arr = map.get(vote.optionId);
    if (arr) arr.push(vote.memberId);
  }
  return map;
}

/** Which option ids a given member voted for in a poll. */
export function myPollVotes(poll: PollWithDetails, memberId: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!memberId) return set;
  for (const vote of poll.votes) if (vote.memberId === memberId) set.add(vote.optionId);
  return set;
}

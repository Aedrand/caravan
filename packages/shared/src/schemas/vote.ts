import { z } from "zod";
import { EpochMsSchema, IdSchema } from "./common";

/**
 * Activity votes (Track A.1 / PD-2): a single positive "I'm in" toggle per
 * member per activity — no downvotes, voters visible by avatar. The row is a
 * trivial (activity, member) tuple; the unique constraint lives in the DB.
 *
 * Votes ride in the trip snapshot as a flat list and reconcile through the
 * same post-image path as activities: a toggle broadcasts the post-image of
 * the *activity* the vote targets, plus the up-to-date voter set carried as
 * the event payload (see FeedPayloadMap["vote.toggle"]).
 */
export const ActivityVoteSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  activityId: IdSchema,
  /** Membership id of the voter (resolves to an avatar via personColors). */
  memberId: IdSchema,
  createdAt: EpochMsSchema,
});
export type ActivityVote = z.infer<typeof ActivityVoteSchema>;

import { z } from "zod";
import { EpochMsSchema, IdSchema } from "./common";

/**
 * Polls (Track A.2 / PD-3): open questions that aren't activity-shaped
 * ("Which week?", "Airbnb or hotel?"). Single-choice by default, multi-select
 * as a creation flag; members may add options when allowed. Voters visible,
 * results live, optional close date; creator or trip owner can close. A closed
 * poll's winning option can be converted into an Ideas-pool activity (A.3).
 *
 * The whole poll graph (poll + options + votes) rides in the trip snapshot and
 * reconciles via the poll's own post-image — a poll post-image is the FULL
 * graph (PollWithDetails) so any sub-change (an added option, a cast vote)
 * lands in one event.
 */

export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 120;
/** A sane ceiling on options per poll to bound the snapshot + UI. */
export const POLL_OPTIONS_LIMIT = 20;

export const PollOptionSchema = z.object({
  id: IdSchema,
  pollId: IdSchema,
  label: z.string().min(1).max(POLL_OPTION_MAX),
  /** Membership id of whoever added the option (creator or, if allowed, a member). */
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
});
export type PollOption = z.infer<typeof PollOptionSchema>;

export const PollVoteSchema = z.object({
  id: IdSchema,
  pollId: IdSchema,
  optionId: IdSchema,
  /** Membership id of the voter (visible — PD-3). */
  memberId: IdSchema,
  createdAt: EpochMsSchema,
});
export type PollVote = z.infer<typeof PollVoteSchema>;

export const PollSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  question: z.string().min(1).max(POLL_QUESTION_MAX),
  multiSelect: z.boolean(),
  allowMemberOptions: z.boolean(),
  /** Membership id of the poll creator (creator or owner may close). */
  createdBy: IdSchema,
  /** Optional scheduled close; the job registry may auto-close at this time. */
  closesAt: EpochMsSchema.nullable(),
  /** Set once closed (manually or scheduled); closed polls stay visible. */
  closedAt: EpochMsSchema.nullable(),
  /** If the poll was converted to an activity, the resulting activity id (A.3). */
  convertedActivityId: IdSchema.nullable(),
  createdAt: EpochMsSchema,
});
export type Poll = z.infer<typeof PollSchema>;

/** A poll with its options and votes — the snapshot + post-image shape. */
export const PollWithDetailsSchema = PollSchema.extend({
  options: z.array(PollOptionSchema),
  votes: z.array(PollVoteSchema),
});
export type PollWithDetails = z.infer<typeof PollWithDetailsSchema>;

import { z } from "zod";
import { EpochMsSchema, IdSchema } from "./common";

/**
 * Comments (Track A.4 / PD-4): flat, non-threaded streams attached to an
 * activity or a poll. Plain text, linkified at render time. Author-editable
 * and author-deletable; the trip owner may also delete (enforced server-side).
 * No reactions, threading, or @-mentions in v1.
 */

/** What a comment hangs off of — exactly one of activity | poll. */
export const COMMENT_TARGET_TYPES = ["activity", "poll"] as const;
export const CommentTargetTypeSchema = z.enum(COMMENT_TARGET_TYPES);
export type CommentTargetType = z.infer<typeof CommentTargetTypeSchema>;

/** Max stored comment length — generous for a "reasons" note, bounded for sanity. */
export const COMMENT_MAX_LENGTH = 2000;

export const CommentSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  targetType: CommentTargetTypeSchema,
  targetId: IdSchema,
  /** Membership id of the author (resolves to name + avatar). */
  authorId: IdSchema,
  body: z.string().min(1).max(COMMENT_MAX_LENGTH),
  createdAt: EpochMsSchema,
  /** Set the first time the body is edited; null otherwise (shows an "edited" tag). */
  editedAt: EpochMsSchema.nullable(),
});
export type Comment = z.infer<typeof CommentSchema>;

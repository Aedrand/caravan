import { z } from "zod";
import { EpochMsSchema, IdSchema, PositionSchema } from "./common";

/** Idea-list name bounds — shared by the read DTO and the mutation payloads. */
export const IDEA_LIST_NAME_MAX = 80;

/**
 * A named bucket for Ideas-pool items (D10, Trip Workspace v2). An idea
 * (activity) belongs to at-most-one list via `activities.listId`; deleting a
 * list unassigns its ideas (they fall to "Unlisted") rather than deleting them.
 * `position` is a fractional ordering key (TD-1), moved through its own
 * `ideaList.reorder` mutation the way `activity.move` isolates ordering.
 */
export const IdeaListSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  name: z.string().min(1).max(IDEA_LIST_NAME_MAX),
  position: PositionSchema,
  /** Membership id of the creator (no FK — history outlives roles, PD-9). */
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});
export type IdeaList = z.infer<typeof IdeaListSchema>;

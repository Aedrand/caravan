import { z } from "zod";
import { ActivitySchema } from "./activity";
import { CommentSchema } from "./comment";
import { CurrencySchema, IsoDateSchema } from "./common";
import { PollWithDetailsSchema } from "./poll";
import { RoleSchema, TripMemberSchema, TripSchema } from "./trip";
import { ActivityVoteSchema } from "./vote";

/** REST DTOs for the sync contract (plan §3.3) and trip CRUD (M1.1). */

/**
 * GET /api/trips/:id/snapshot — full state; `trip.version` is the sync cursor.
 *
 * Track A appended `votes`, `comments`, and `polls` (additive — older clients
 * ignore unknown keys, newer servers always send them). They reconcile through
 * the same post-image path as activities, so the snapshot stays the single
 * source the UI renders from.
 */
export const TripSnapshotSchema = z.object({
  trip: TripSchema,
  members: z.array(TripMemberSchema),
  activities: z.array(ActivitySchema),
  votes: z.array(ActivityVoteSchema),
  comments: z.array(CommentSchema),
  polls: z.array(PollWithDetailsSchema),
});
export type TripSnapshot = z.infer<typeof TripSnapshotSchema>;

/** GET /api/trips — one entry per membership of the calling user. */
export const TripListItemSchema = z.object({
  trip: TripSchema,
  role: RoleSchema,
  memberCount: z.number().int().positive(),
});
export type TripListItem = z.infer<typeof TripListItemSchema>;

/** POST /api/trips body. */
export const CreateTripSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    destination: z.string().trim().max(200).nullable().default(null),
    startDate: IsoDateSchema.nullable().default(null),
    endDate: IsoDateSchema.nullable().default(null),
    currency: CurrencySchema.default("USD"),
  })
  .refine((p) => !p.startDate || !p.endDate || p.startDate <= p.endDate, {
    message: "endDate must not be before startDate",
  });
export type CreateTripInput = z.infer<typeof CreateTripSchema>;

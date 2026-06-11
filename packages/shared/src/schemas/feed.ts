import { z } from "zod";
import { EpochMsSchema, IdSchema } from "./common";

/**
 * One row per mutation: simultaneously the activity feed (PD-5), the sync
 * catch-up log, and the attribution record (TD-1). `id` is the mutation id,
 * which is what makes mutations idempotent.
 */

export const ACTOR_TYPES = ["user", "house_ai", "personal_ai"] as const;
export const ActorTypeSchema = z.enum(ACTOR_TYPES);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const ENTITY_TYPES = ["trip", "member", "invite", "activity"] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const FeedEventSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  version: z.number().int().positive(),
  actorType: ActorTypeSchema,
  /** Membership id of the human behind the action (AI actors carry the asking member — PD-11). */
  actorMemberId: IdSchema.nullable(),
  /** Mutation type, e.g. "activity.move" — render copy is keyed on this. */
  type: z.string(),
  entityType: EntityTypeSchema,
  entityId: IdSchema,
  /** Type-specific summary snapshot for rendering (see FeedPayloadMap). */
  payload: z.unknown(),
  createdAt: EpochMsSchema,
});
export type FeedEvent = z.infer<typeof FeedEventSchema>;

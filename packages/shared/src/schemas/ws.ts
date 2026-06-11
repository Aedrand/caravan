import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common";
import { FeedEventSchema } from "./feed";

/** WebSocket wire contract (TD-1): server pushes, clients only report presence. */

/** What a member is currently looking at / touching — ephemeral, never persisted. */
export const PresenceViewSchema = z.strictObject({
  /** A day, the ideas pool, or nothing in particular. */
  date: z.union([IsoDateSchema, z.literal("ideas")]).nullable(),
  /** Activity whose card is open/focused. */
  activityId: IdSchema.nullable(),
  /** Activity being actively edited (drives "editing now" hints — PD-5). */
  editing: IdSchema.nullable(),
});
export type PresenceView = z.infer<typeof PresenceViewSchema>;

export const PresenceStateSchema = z.object({
  memberId: IdSchema,
  name: z.string(),
  view: PresenceViewSchema,
  /** Last update, epoch ms (server clock). */
  ts: z.number().int().nonnegative(),
});
export type PresenceState = z.infer<typeof PresenceStateSchema>;

/** client → server */
export const ClientWsMessageSchema = z.strictObject({
  kind: z.literal("presence"),
  view: PresenceViewSchema,
});
export type ClientWsMessage = z.infer<typeof ClientWsMessageSchema>;

/** server → client */
export const ServerWsMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hello"), version: z.number().int().nonnegative() }),
  z.object({
    kind: z.literal("event"),
    event: FeedEventSchema,
    /** EntityPostImage | null — refine with entityPostImageSchemas[event.entityType]. */
    entity: z.unknown(),
  }),
  z.object({ kind: z.literal("presence"), members: z.array(PresenceStateSchema) }),
]);
export type ServerWsMessage = z.infer<typeof ServerWsMessageSchema>;

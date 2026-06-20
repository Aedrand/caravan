import { z } from "zod";
import { ActivityCategorySchema, PlaceSchema } from "./schemas/activity";
import { COMMENT_MAX_LENGTH, CommentTargetTypeSchema } from "./schemas/comment";
import {
  CurrencySchema,
  EpochMsSchema,
  HhMmSchema,
  IdSchema,
  IsoDateSchema,
  PositionSchema,
} from "./schemas/common";
import type { EntityPostImage, FeedEvent } from "./schemas/feed";
import { POLL_OPTION_MAX, POLL_OPTIONS_LIMIT, POLL_QUESTION_MAX } from "./schemas/poll";
import { InviteRoleSchema } from "./schemas/trip";

/**
 * The mutation registry (TD-1) — every change to shared trip data is one of
 * these, whether it comes from a browser, the house AI, or a personal AI via
 * MCP. One source of truth for payload validation on both sides of the wire,
 * and later for the AI tool definitions (TD-6/TD-7).
 *
 * Conventions:
 * - strictObject everywhere: unknown keys are wire errors, not surprises.
 * - Entity ids are CLIENT-generated (createId) so optimistic inserts are
 *   stable across the optimistic→confirmed transition.
 * - `date`/`position` move only via activity.move — the canonical concurrent
 *   conflict resolves by LWW on exactly those fields (PD-5).
 */

const timePairRefinement = {
  check: (val: { startTime?: string | null; endTime?: string | null }) =>
    !val.startTime || !val.endTime || val.startTime <= val.endTime,
  message: "endTime must not be before startTime",
};

/**
 * http(s) only: bare z.url() passes any WHATWG-parseable URL, including
 * javascript: and data: — a stored-XSS primitive once link-out buttons render
 * these as hrefs (1.7).
 */
const LinkUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);

export const mutationPayloads = {
  "trip.update": z
    .strictObject({
      name: z.string().trim().min(1).max(120).optional(),
      destination: z.string().trim().max(200).nullable().optional(),
      startDate: IsoDateSchema.nullable().optional(),
      endDate: IsoDateSchema.nullable().optional(),
      currency: CurrencySchema.optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "empty patch" })
    .refine((p) => !p.startDate || !p.endDate || p.startDate <= p.endDate, {
      message: "endDate must not be before startDate",
    }),
  "trip.archive": z.strictObject({}),
  "trip.unarchive": z.strictObject({}),
  "trip.transferOwnership": z.strictObject({ memberId: IdSchema }),

  "member.leave": z.strictObject({}),
  "member.remove": z.strictObject({ memberId: IdSchema }),
  "member.setRole": z.strictObject({ memberId: IdSchema, role: InviteRoleSchema }),

  "invite.create": z.strictObject({
    role: InviteRoleSchema.default("editor"),
    expiresAt: EpochMsSchema.nullable().default(null),
  }),
  "invite.revoke": z.strictObject({ inviteId: IdSchema }),

  "activity.create": z
    .strictObject({
      activityId: IdSchema,
      title: z.string().trim().min(1).max(200),
      date: IsoDateSchema.nullable(),
      position: PositionSchema,
      category: ActivityCategorySchema.default("other"),
      startTime: HhMmSchema.nullable().default(null),
      endTime: HhMmSchema.nullable().default(null),
      notes: z.string().max(5000).default(""),
      linkUrl: LinkUrlSchema.nullable().default(null),
      place: PlaceSchema.nullable().default(null),
    })
    .refine(timePairRefinement.check, { message: timePairRefinement.message }),
  "activity.update": z.strictObject({
    activityId: IdSchema,
    patch: z
      .strictObject({
        title: z.string().trim().min(1).max(200).optional(),
        category: ActivityCategorySchema.optional(),
        startTime: HhMmSchema.nullable().optional(),
        endTime: HhMmSchema.nullable().optional(),
        notes: z.string().max(5000).optional(),
        linkUrl: LinkUrlSchema.nullable().optional(),
        place: PlaceSchema.nullable().optional(),
      })
      .refine((p) => Object.keys(p).length > 0, { message: "empty patch" }),
  }),
  "activity.move": z.strictObject({
    activityId: IdSchema,
    date: IsoDateSchema.nullable(),
    position: PositionSchema,
  }),
  "activity.delete": z.strictObject({ activityId: IdSchema }),

  // --- Track A: group decisions (votes / comments / polls) -----------------

  /** Toggle this member's single positive vote on an activity (PD-2). */
  "vote.toggle": z.strictObject({ activityId: IdSchema }),

  /**
   * Comments (PD-4). The id is client-generated (stable optimistic insert) and
   * the target is exactly one of activity | poll. Bodies are trimmed plain text.
   */
  "comment.create": z.strictObject({
    commentId: IdSchema,
    targetType: CommentTargetTypeSchema,
    targetId: IdSchema,
    body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
  }),
  "comment.update": z.strictObject({
    commentId: IdSchema,
    body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
  }),
  "comment.delete": z.strictObject({ commentId: IdSchema }),

  /**
   * Polls (PD-3). The poll id and the initial option ids are client-generated.
   * Single-choice by default; member-added options default ON.
   */
  "poll.create": z.strictObject({
    pollId: IdSchema,
    question: z.string().trim().min(1).max(POLL_QUESTION_MAX),
    multiSelect: z.boolean().default(false),
    allowMemberOptions: z.boolean().default(true),
    closesAt: EpochMsSchema.nullable().default(null),
    options: z
      .array(
        z.strictObject({
          optionId: IdSchema,
          label: z.string().trim().min(1).max(POLL_OPTION_MAX),
        }),
      )
      .min(2)
      .max(POLL_OPTIONS_LIMIT),
  }),
  /** Add an option to an existing poll (allowed for members only if the poll permits it). */
  "poll.addOption": z.strictObject({
    pollId: IdSchema,
    optionId: IdSchema,
    label: z.string().trim().min(1).max(POLL_OPTION_MAX),
  }),
  /**
   * Set this member's vote(s). The full chosen option set is sent (not a delta)
   * so the toggle is idempotent and respects the single/multi flag server-side.
   */
  "poll.vote": z.strictObject({
    pollId: IdSchema,
    optionIds: z.array(IdSchema).max(POLL_OPTIONS_LIMIT),
  }),
  /** Close a poll early (creator or trip owner). Closed polls stay visible. */
  "poll.close": z.strictObject({ pollId: IdSchema }),
  /**
   * Convert a closed poll's winning option into an Ideas-pool activity (A.3).
   * The new activity id + its ordering position are client-generated.
   */
  "poll.convert": z.strictObject({
    pollId: IdSchema,
    activityId: IdSchema,
    position: PositionSchema,
  }),
} as const;

export type MutationType = keyof typeof mutationPayloads;
export const MUTATION_TYPES = Object.keys(mutationPayloads) as [MutationType, ...MutationType[]];

export type MutationPayload<T extends MutationType> = z.infer<(typeof mutationPayloads)[T]>;

/** A validated mutation envelope, discriminated by type. */
export type Mutation = {
  [K in MutationType]: { id: string; type: K; payload: MutationPayload<K> };
}[MutationType];

const EnvelopeBaseSchema = z.object({
  /** Client-generated mutation id — doubles as the idempotency key and the feed event id. */
  id: IdSchema,
  type: z.enum(MUTATION_TYPES),
  payload: z.unknown(),
});

/** Two-step parse: envelope shape, then the payload schema for its type. */
export function parseMutation(input: unknown): Mutation {
  const base = EnvelopeBaseSchema.parse(input);
  const payload = mutationPayloads[base.type].parse(base.payload ?? {});
  return { id: base.id, type: base.type, payload } as Mutation;
}

/** What POST /api/trips/:id/mutations returns. */
export interface MutationResponse {
  version: number;
  event: FeedEvent;
  /** Post-image of the event's entity — null when it no longer exists (deletes). */
  entity: EntityPostImage | null;
  /** Private extras for the caller only (e.g. invite.create returns the raw token once). */
  result?: unknown;
}

/**
 * Typed feed payload per mutation type — the server constructs these, the
 * feed UI renders them. TS-only on purpose; FeedEventSchema keeps `payload`
 * loose on the wire.
 */
export interface FeedPayloadMap {
  "trip.update": { fields: string[] };
  "trip.archive": Record<string, never>;
  "trip.unarchive": Record<string, never>;
  "trip.transferOwnership": { toName: string };
  "member.leave": { name: string };
  "member.remove": { name: string };
  "member.setRole": { name: string; role: string };
  "invite.create": { role: string };
  "invite.revoke": Record<string, never>;
  "activity.create": { title: string; date: string | null };
  "activity.update": { title: string; fields: string[] };
  "activity.move": { title: string; fromDate: string | null; toDate: string | null };
  "activity.delete": { title: string; date: string | null };

  // --- Track A ---------------------------------------------------------------
  /** `on` distinguishes the cast vs. the retraction in the feed verb. */
  "vote.toggle": { activityTitle: string; on: boolean };
  "comment.create": { targetType: "activity" | "poll"; targetTitle: string };
  "comment.update": { targetType: "activity" | "poll"; targetTitle: string };
  "comment.delete": { targetType: "activity" | "poll"; targetTitle: string };
  "poll.create": { question: string };
  "poll.addOption": { question: string; label: string };
  "poll.vote": { question: string };
  "poll.close": { question: string };
  "poll.convert": { question: string; activityTitle: string };
}

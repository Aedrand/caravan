import { z } from "zod";
import { ActivityCategorySchema, PlaceSchema } from "./schemas/activity";
import {
  CurrencySchema,
  EpochMsSchema,
  HhMmSchema,
  IdSchema,
  IsoDateSchema,
  PositionSchema,
} from "./schemas/common";
import { AmountMinorSchema, ExpenseCategorySchema } from "./schemas/expense";
import type { EntityPostImage, FeedEvent } from "./schemas/feed";
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

/**
 * How an expense is divided (PD-8). Two modes:
 * - `equal`: split evenly among `memberIds`; the server distributes rounding
 *   remainders by largest-remainder so the shares sum exactly to the total.
 * - `exact`: explicit per-member minor-unit amounts; the server validates the
 *   sum equals the total. Custom amounts may be zero (a member who owes nothing
 *   but is "in" on the line item is fine to omit instead).
 *
 * Participants are trip MEMBERSHIP ids — ghosts included, so balances stay
 * stable after someone leaves (PD-9).
 */
export const SplitSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("equal"),
    memberIds: z.array(IdSchema).min(1),
  }),
  z.strictObject({
    kind: z.literal("exact"),
    shares: z
      .array(z.strictObject({ memberId: IdSchema, amountMinor: AmountMinorSchema.nonnegative() }))
      .min(1),
  }),
]);
export type SplitSpec = z.infer<typeof SplitSpecSchema>;

const ExpenseCreateSchema = z.strictObject({
  expenseId: IdSchema,
  paidBy: IdSchema,
  amountMinor: AmountMinorSchema.positive(),
  description: z.string().trim().min(1).max(200),
  category: ExpenseCategorySchema.default("other"),
  notes: z.string().max(2000).default(""),
  date: IsoDateSchema.nullable().default(null),
  activityId: IdSchema.nullable().default(null),
  split: SplitSpecSchema,
});

const ExpensePatchSchema = z
  .strictObject({
    paidBy: IdSchema.optional(),
    amountMinor: AmountMinorSchema.positive().optional(),
    description: z.string().trim().min(1).max(200).optional(),
    category: ExpenseCategorySchema.optional(),
    notes: z.string().max(2000).optional(),
    date: IsoDateSchema.nullable().optional(),
    activityId: IdSchema.nullable().optional(),
    /**
     * Re-splitting is all-or-nothing: present `split` replaces every share,
     * absent leaves them untouched. The server re-validates that the resulting
     * shares sum to the (possibly new) amount.
     */
    split: SplitSpecSchema.optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: "empty patch" });

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

  // ── Track B: expenses & settlement (PD-8) ──────────────────────────────
  // Splits are declared, not enumerated: the client sends a SplitSpec and the
  // server materializes the per-participant `shares` (equal → largest-remainder
  // rounding; exact → validated to sum to the total). Money is integer minor
  // units everywhere.
  "expense.create": ExpenseCreateSchema,
  "expense.update": z.strictObject({
    expenseId: IdSchema,
    patch: ExpensePatchSchema,
  }),
  "expense.delete": z.strictObject({ expenseId: IdSchema }),

  "payment.create": z
    .strictObject({
      paymentId: IdSchema,
      fromMember: IdSchema,
      toMember: IdSchema,
      amountMinor: AmountMinorSchema.positive(),
      notes: z.string().max(2000).default(""),
      date: IsoDateSchema.nullable().default(null),
    })
    .refine((p) => p.fromMember !== p.toMember, {
      message: "a payment must be between two different members",
    }),
  "payment.delete": z.strictObject({ paymentId: IdSchema }),
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
  "expense.create": { description: string; amountMinor: number };
  "expense.update": { description: string; fields: string[] };
  "expense.delete": { description: string; amountMinor: number };
  "payment.create": { fromName: string; toName: string; amountMinor: number };
  "payment.delete": { fromName: string; toName: string; amountMinor: number };
}

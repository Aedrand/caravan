import { z } from "zod";
import {
  ActivityCategorySchema,
  ChecklistItemSchema,
  type ItemType,
  ItemTypeSchema,
  PlaceSchema,
} from "./schemas/activity";
import { COMMENT_MAX_LENGTH, CommentTargetTypeSchema } from "./schemas/comment";
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
import { IDEA_LIST_NAME_MAX } from "./schemas/idea-list";
import { POLL_OPTION_MAX, POLL_OPTIONS_LIMIT, POLL_QUESTION_MAX } from "./schemas/poll";
import { RouteModeSchema } from "./schemas/route";
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
 * D1 typed-item refinements on `activity.create` (Trip Workspace v2):
 * - checklist items may only ride on a `checklist`-type item; and
 * - the V2.4 booking refinements below constrain flight/lodging fields to the
 *   right `type` (flight/lodging creates are no longer guarded — V2.4 lands them).
 */
const checklistOnlyRefinement = {
  check: (val: { type: string; checklistItems: unknown }) =>
    val.checklistItems === null || val.type === "checklist",
  message: "checklistItems are only allowed on a checklist item",
};

/**
 * V2.4 booking refinements on `activity.create`:
 * - `endDate` (check-out / arrival) must not precede the item's `date`;
 * - a `lodging` booking must carry a check-out date (`endDate`);
 * - an arrival place (`arrPlace`) only makes sense on a `flight`; and
 * - a `flightNumber` only makes sense on a `flight`.
 */
const bookingDateOrderRefinement = {
  check: (val: { date?: string | null; endDate?: string | null }) =>
    !val.date || !val.endDate || val.endDate >= val.date,
  message: "endDate must not be before date",
};
const lodgingNeedsEndDateRefinement = {
  check: (val: { type: string; endDate?: string | null }) =>
    val.type !== "lodging" || (val.endDate ?? null) !== null,
  message: "lodging bookings require a check-out date",
};
const arrPlaceFlightOnlyRefinement = {
  check: (val: { type: string; arrPlace?: unknown }) =>
    (val.arrPlace ?? null) === null || val.type === "flight",
  message: "an arrival place is only allowed on a flight",
};
const flightNumberFlightOnlyRefinement = {
  check: (val: { type: string; flightNumber?: string | null }) =>
    (val.flightNumber ?? null) === null || val.type === "flight",
  message: "a flight number is only allowed on a flight",
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
      /** V2.5 trip-wide default routing mode (days inherit it unless overridden). */
      defaultRouteMode: RouteModeSchema.optional(),
      /** V2.7 group bulletin: present `null` clears it, a string sets it. */
      bulletin: z.string().max(5000).nullable().optional(),
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
    /**
     * Optional recipient (D.1). When set and SMTP is configured, the server
     * emails the join link to this address; the raw token is still returned so
     * the copyable link is always the fallback. Stored on inviteLinks.email.
     */
    email: z.email().nullable().default(null),
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
      // D1 typed items (Trip Workspace v2). Defaults preserve pre-v2 clients:
      // a create with none of these is a plain dated `activity`.
      type: ItemTypeSchema.default("activity"),
      estimatedCostMinor: z.number().int().nonnegative().nullable().default(null),
      listId: IdSchema.nullable().default(null),
      checklistItems: z.array(ChecklistItemSchema).nullable().default(null),
      // V2.4 booking fields. Defaults keep pre-v2.4 clients valid: a create with
      // none of these is a plain item. `arrPlace` is a FLIGHT's arrival place;
      // `place` (above) is the departure airport / lodging address.
      endDate: IsoDateSchema.nullable().default(null),
      confirmationCode: z.string().max(100).nullable().default(null),
      arrPlace: PlaceSchema.nullable().default(null),
      flightNumber: z.string().trim().max(20).nullable().default(null),
    })
    .refine(timePairRefinement.check, { message: timePairRefinement.message })
    .refine(checklistOnlyRefinement.check, { message: checklistOnlyRefinement.message })
    .refine(bookingDateOrderRefinement.check, { message: bookingDateOrderRefinement.message })
    .refine(lodgingNeedsEndDateRefinement.check, { message: lodgingNeedsEndDateRefinement.message })
    .refine(arrPlaceFlightOnlyRefinement.check, { message: arrPlaceFlightOnlyRefinement.message })
    .refine(flightNumberFlightOnlyRefinement.check, {
      message: flightNumberFlightOnlyRefinement.message,
    }),
  "activity.update": z.strictObject({
    activityId: IdSchema,
    // `type` is intentionally absent — the discriminator is immutable after
    // create (changing a stop into a note mid-life is ill-defined about which
    // fields to clear; delete + recreate instead).
    patch: z
      .strictObject({
        title: z.string().trim().min(1).max(200).optional(),
        category: ActivityCategorySchema.optional(),
        startTime: HhMmSchema.nullable().optional(),
        endTime: HhMmSchema.nullable().optional(),
        notes: z.string().max(5000).optional(),
        linkUrl: LinkUrlSchema.nullable().optional(),
        place: PlaceSchema.nullable().optional(),
        estimatedCostMinor: z.number().int().nonnegative().nullable().optional(),
        listId: IdSchema.nullable().optional(),
        checklistItems: z.array(ChecklistItemSchema).nullable().optional(),
        // V2.4 booking fields (editable post-create; `type` stays immutable).
        endDate: IsoDateSchema.nullable().optional(),
        confirmationCode: z.string().max(100).nullable().optional(),
        arrPlace: PlaceSchema.nullable().optional(),
        flightNumber: z.string().trim().max(20).nullable().optional(),
      })
      .refine((p) => Object.keys(p).length > 0, { message: "empty patch" }),
  }),
  "activity.move": z.strictObject({
    activityId: IdSchema,
    date: IsoDateSchema.nullable(),
    position: PositionSchema,
  }),
  "activity.delete": z.strictObject({ activityId: IdSchema }),

  // --- Trip Workspace v2: typed items, days, idea lists --------------------

  /**
   * Check/uncheck ONE checklist entry by id (D1). A dedicated per-item toggle —
   * not a whole-array `activity.update` — so concurrent toggles of different
   * items converge in the transaction instead of clobbering. Structural edits
   * (add/rename/remove/reorder) go through `activity.update`'s array replace.
   */
  "checklist.toggle": z.strictObject({
    activityId: IdSchema,
    itemId: IdSchema,
    done: z.boolean(),
  }),

  /**
   * Lazy find-or-create a day's metadata by `(tripId, date)` (D2). One mutation
   * expresses "set this day's subtitle whether or not a row exists yet"; the
   * unique `(tripId, date)` index resolves the create race (a second concurrent
   * create falls through to an update). `dayId` is used only on the create path.
   */
  "day.upsert": z
    .strictObject({
      dayId: IdSchema,
      date: IsoDateSchema,
      // Both metadata fields are independently optional now (V2.4 adds the home-
      // base override): an absent key leaves that column untouched; a present
      // `null` clears it. The refine keeps the upsert from being a no-op.
      subtitle: z.string().max(120).nullable().optional(),
      homeBasePlace: PlaceSchema.nullable().optional(),
      // V2.5 per-day routing-mode override: absent leaves it untouched, a present
      // `null` clears it back to inheriting the trip default.
      routeMode: RouteModeSchema.nullable().optional(),
    })
    .refine(
      (p) => p.subtitle !== undefined || p.homeBasePlace !== undefined || p.routeMode !== undefined,
      {
        message: "day.upsert requires at least one of subtitle, homeBasePlace, or routeMode",
      },
    ),

  /**
   * Idea lists (D10). `reorder` is its own seam (mirroring `activity.move`) so
   * the fractional-index ordering conflict stays isolated. `delete` unassigns
   * member ideas via the `ON DELETE SET NULL` FK — they survive as "Unlisted".
   */
  "ideaList.create": z.strictObject({
    listId: IdSchema,
    name: z.string().trim().min(1).max(IDEA_LIST_NAME_MAX),
    position: PositionSchema,
  }),
  "ideaList.update": z.strictObject({
    listId: IdSchema,
    name: z.string().trim().min(1).max(IDEA_LIST_NAME_MAX),
  }),
  "ideaList.reorder": z.strictObject({ listId: IdSchema, position: PositionSchema }),
  "ideaList.delete": z.strictObject({ listId: IdSchema }),

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
  "activity.create": { title: string; date: string | null; type: ItemType };
  "activity.update": { title: string; fields: string[] };
  "activity.move": { title: string; fromDate: string | null; toDate: string | null };
  "activity.delete": { title: string; date: string | null };

  // --- Trip Workspace v2 -----------------------------------------------------
  "checklist.toggle": { title: string; item: string; done: boolean };
  "day.upsert": { date: string; fields: string[] };
  "ideaList.create": { name: string };
  "ideaList.update": { name: string };
  "ideaList.reorder": { name: string };
  "ideaList.delete": { name: string };

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
  "expense.create": { description: string; amountMinor: number };
  "expense.update": { description: string; fields: string[] };
  "expense.delete": { description: string; amountMinor: number };
  "payment.create": { fromName: string; toName: string; amountMinor: number };
  "payment.delete": { fromName: string; toName: string; amountMinor: number };
}

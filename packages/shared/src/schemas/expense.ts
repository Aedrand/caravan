import { z } from "zod";
import { EpochMsSchema, IdSchema, IsoDateSchema } from "./common";

/**
 * Expense entity (Track B, PD-8). Money is integer minor units (cents) end to
 * end — never a float on the wire, in the DB, or in the settlement math. A
 * single currency per trip (the trip's `currency`) so amounts need no unit.
 *
 * An expense is split among selected members via `expense_shares` (one row per
 * participant). Splits sum exactly to `amountMinor` — the server enforces this
 * with largest-remainder rounding for the equal case and an exact-sum check for
 * the custom case.
 */

/** Fixed category set (PD-8 / Track B brief) — closed enum, not freeform. */
export const EXPENSE_CATEGORIES = [
  "food",
  "transport",
  "accommodation",
  "activities",
  "shopping",
  "other",
] as const;
export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

/** Minor units (cents). Non-negative integer; an expense total must be > 0. */
export const AmountMinorSchema = z.number().int();

/** One participant's slice of an expense. Shares of one expense sum to its total. */
export const ExpenseShareSchema = z.object({
  /** Trip membership id of the participant (may be a ghost — PD-9). */
  memberId: IdSchema,
  amountMinor: AmountMinorSchema.nonnegative(),
});
export type ExpenseShare = z.infer<typeof ExpenseShareSchema>;

// Forward reference: PaymentSchema lives in ./payment, which imports from here.
// The money read DTO is declared in ./payment to avoid a cycle.

export const ExpenseSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  /** Membership id of the payer (the member who fronted the money). */
  paidBy: IdSchema,
  /** Total in minor units; strictly positive. */
  amountMinor: AmountMinorSchema.positive(),
  description: z.string().min(1).max(200),
  category: ExpenseCategorySchema,
  notes: z.string().max(2000),
  /** Optional itinerary linkage (PD-8). */
  date: IsoDateSchema.nullable(),
  activityId: IdSchema.nullable(),
  /** Per-participant shares — always present, always summing to amountMinor. */
  shares: z.array(ExpenseShareSchema).min(1),
  /** Membership id of the creator (for the edit/delete permission rule). */
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});
export type Expense = z.infer<typeof ExpenseSchema>;

import { z } from "zod";
import { EpochMsSchema, IdSchema, IsoDateSchema } from "./common";
import { AmountMinorSchema, ExpenseSchema } from "./expense";

/**
 * Payment entity (Track B, PD-8) — a first-class transfer of money from one
 * member to another ("Alice paid Bob $50"), distinct from an expense. Payments
 * settle debts: partial settlement works from day one because the settlement
 * engine simply nets payments against expense balances.
 *
 * Money is integer minor units (cents), in the trip's single currency.
 */
export const PaymentSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  /** Membership id of the member who paid (the debtor settling up). */
  fromMember: IdSchema,
  /** Membership id of the member who received it (the creditor). */
  toMember: IdSchema,
  amountMinor: AmountMinorSchema.positive(),
  notes: z.string().max(2000),
  date: IsoDateSchema.nullable(),
  /** Membership id of the creator (for the edit/delete permission rule). */
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});
export type Payment = z.infer<typeof PaymentSchema>;

/**
 * GET /api/trips/:id/money — the money read surface for Track B. Expenses and
 * payments live OUTSIDE the trip snapshot (kept lean for the itinerary core);
 * the client fetches this and refetches it when an expense/payment feed event
 * arrives. Settlement is computed client-side from these (never stored).
 */
export const TripMoneySchema = z.object({
  expenses: z.array(ExpenseSchema),
  payments: z.array(PaymentSchema),
});
export type TripMoney = z.infer<typeof TripMoneySchema>;

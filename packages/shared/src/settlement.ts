import type { Expense } from "./schemas/expense";
import type { Payment } from "./schemas/payment";

/**
 * The settlement engine (Track B.3, PD-8) — the highest-trust screen in the
 * app, so it is a PURE function tested to the cent.
 *
 * Money is integer minor units (cents) throughout; there is no float math
 * anywhere in this file. Given a trip's expenses (with their per-participant
 * shares), and payments already made, it computes:
 *
 *   1. each member's NET balance (positive = owed money / a creditor;
 *      negative = owes money / a debtor),
 *   2. a minimal "who pays whom" transfer list that zeroes everyone out,
 *      via greedy largest-debtor ↔ largest-creditor matching (≤ n−1 transfers).
 *
 * Balances are derived only from what's recorded — expense shares already sum
 * exactly to each expense total (largest-remainder rounding upstream), so the
 * sum of all net balances is always exactly zero. Ghost members (PD-9) are
 * included like anyone else: their balances persist so the math never silently
 * shifts when someone leaves.
 */

export interface MemberBalance {
  memberId: string;
  /** What this member paid out across all expenses (as payer), in minor units. */
  paidMinor: number;
  /** What this member's shares add up to — their cost of the trip, minor units. */
  owedMinor: number;
  /** Net of payments sent (−) and received (+) between members, minor units. */
  paymentsMinor: number;
  /**
   * Net position: paid − owed + paymentsNet.
   * > 0 → owed money (creditor); < 0 → owes money (debtor); 0 → settled.
   */
  netMinor: number;
}

/** One settlement transfer: `from` pays `to` `amountMinor` to reduce debts. */
export interface SettlementTransfer {
  fromMember: string;
  toMember: string;
  amountMinor: number;
}

export interface Settlement {
  balances: MemberBalance[];
  transfers: SettlementTransfer[];
}

interface BalanceAccumulator {
  paidMinor: number;
  owedMinor: number;
  paymentsMinor: number;
}

function ensure(map: Map<string, BalanceAccumulator>, memberId: string): BalanceAccumulator {
  let acc = map.get(memberId);
  if (!acc) {
    acc = { paidMinor: 0, owedMinor: 0, paymentsMinor: 0 };
    map.set(memberId, acc);
  }
  return acc;
}

/**
 * Compute net balances for every member touched by an expense or payment.
 *
 * - Each expense credits its payer by the full total (they fronted it) and
 *   debits each participant by their share.
 * - Each payment moves money from the debtor (who paid down their debt, so
 *   their net rises) to the creditor (whose net falls toward zero). A payment
 *   from D to C increases D's `paymentsMinor` and decreases C's.
 *
 * `memberIds`, when given, seeds the result so members with zero activity still
 * appear (e.g. everyone on the trip). Output is sorted by memberId for
 * determinism.
 */
export function computeBalances(
  expenses: Expense[],
  payments: Payment[],
  memberIds: string[] = [],
): MemberBalance[] {
  const map = new Map<string, BalanceAccumulator>();
  for (const id of memberIds) ensure(map, id);

  for (const expense of expenses) {
    ensure(map, expense.paidBy).paidMinor += expense.amountMinor;
    for (const share of expense.shares) {
      ensure(map, share.memberId).owedMinor += share.amountMinor;
    }
  }

  for (const payment of payments) {
    // The debtor's outflow lifts their net up toward zero...
    ensure(map, payment.fromMember).paymentsMinor += payment.amountMinor;
    // ...and the creditor's receipt lowers theirs back toward zero.
    ensure(map, payment.toMember).paymentsMinor -= payment.amountMinor;
  }

  return [...map.entries()]
    .map(([memberId, a]) => ({
      memberId,
      paidMinor: a.paidMinor,
      owedMinor: a.owedMinor,
      paymentsMinor: a.paymentsMinor,
      netMinor: a.paidMinor - a.owedMinor + a.paymentsMinor,
    }))
    .sort((x, y) => (x.memberId < y.memberId ? -1 : x.memberId > y.memberId ? 1 : 0));
}

/**
 * Reduce net balances to a minimal transfer list via greedy matching: at each
 * step the largest debtor pays the largest creditor min(|debt|, credit), which
 * zeroes at least one of them — so the result is ≤ n−1 transfers.
 *
 * Deterministic: ties broken by memberId so the same balances always yield the
 * same plan (important for a screen people screenshot and act on). Members who
 * are already square (net 0) produce no transfers.
 */
export function settleBalances(balances: MemberBalance[]): SettlementTransfer[] {
  // Work on copies; sort for a stable starting order.
  const debtors = balances
    .filter((b) => b.netMinor < 0)
    .map((b) => ({ memberId: b.memberId, amount: -b.netMinor }))
    .sort(byAmountThenId);
  const creditors = balances
    .filter((b) => b.netMinor > 0)
    .map((b) => ({ memberId: b.memberId, amount: b.netMinor }))
    .sort(byAmountThenId);

  const transfers: SettlementTransfer[] = [];
  let di = 0;
  let ci = 0;

  for (let debtor = debtors[di], creditor = creditors[ci]; debtor && creditor; ) {
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      transfers.push({
        fromMember: debtor.memberId,
        toMember: creditor.memberId,
        amountMinor: amount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtor = debtors[++di];
    if (creditor.amount === 0) creditor = creditors[++ci];
  }

  return transfers;
}

/** Larger amount first; ties by memberId for determinism. */
function byAmountThenId(
  a: { memberId: string; amount: number },
  b: { memberId: string; amount: number },
): number {
  if (a.amount !== b.amount) return b.amount - a.amount;
  return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
}

/** Full settlement: balances + the minimal transfer plan. */
export function settle(
  expenses: Expense[],
  payments: Payment[],
  memberIds: string[] = [],
): Settlement {
  const balances = computeBalances(expenses, payments, memberIds);
  return { balances, transfers: settleBalances(balances) };
}

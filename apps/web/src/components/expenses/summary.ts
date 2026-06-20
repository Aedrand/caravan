import type { Expense, ExpenseCategory } from "@caravan/shared";

/**
 * Pure expense summaries for the money UI — per-category totals and the trip
 * budget figure. Per-person paid/owed/net comes straight from the settlement
 * engine's `computeBalances` (shared lib), so it isn't duplicated here. Integer
 * minor units throughout.
 */

export interface CategoryTotal {
  category: ExpenseCategory;
  totalMinor: number;
}

/** Per-category spend, largest first; only categories with spend appear. */
export function categoryTotals(expenses: Expense[]): CategoryTotal[] {
  const map = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amountMinor);
  }
  return [...map.entries()]
    .map(([category, totalMinor]) => ({ category, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Total spend across all expenses (the trip's running cost). */
export function totalSpend(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amountMinor, 0);
}

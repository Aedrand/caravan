import type { Activity, ActivityCategory, ExpenseCategory } from "@caravan/shared";

/**
 * V2.6 budget math — the planned (per-activity estimate) side of the
 * planned-vs-actual comparison. Pure + React-free so it's trivially testable and
 * the planned selector stays a small swappable function (the one semantics the
 * owner may flip later: today `planned = Σ estimate over DATED activities`).
 * Integer minor units throughout, matching the expenses system.
 */

export type BudgetStatus = "under" | "warning" | "over";

/**
 * Planned spend: the sum of `estimatedCostMinor` across every DATED activity
 * (any type — stops, bookings, notes/checklists that carry an estimate). Ideas
 * (date === null) are excluded; a `0` estimate counts, a `null` estimate (no
 * figure entered) does not.
 */
export function plannedMinor(activities: Activity[]): number {
  let sum = 0;
  for (const a of activities) {
    if (a.date !== null && a.estimatedCostMinor != null) sum += a.estimatedCostMinor;
  }
  return sum;
}

/** Planned spend for a single day (its dated activities' estimates). */
export function dayPlannedMinor(activities: Activity[], date: string): number {
  let sum = 0;
  for (const a of activities) {
    if (a.date === date && a.estimatedCostMinor != null) sum += a.estimatedCostMinor;
  }
  return sum;
}

/**
 * Compare actual spend against the plan:
 * - `over`    — actual exceeds planned.
 * - `warning` — actual has reached 90% of planned (but not over).
 * - `under`   — comfortably within plan, OR there's no plan to compare against
 *   (`planned === 0` → no budget set, so never "over").
 */
export function budgetStatus(planned: number, actual: number): BudgetStatus {
  if (planned <= 0) return "under";
  if (actual > planned) return "over";
  if (actual >= 0.9 * planned) return "warning";
  return "under";
}

/**
 * Map an activity's category onto the closest expense category, so a converted
 * estimate lands pre-seeded with a sensible expense category. (Activity has
 * `sights`/`activity`; expenses fold both into `activities`, and `lodging` →
 * `accommodation`.)
 */
const ACTIVITY_TO_EXPENSE_CATEGORY: Record<ActivityCategory, ExpenseCategory> = {
  food: "food",
  sights: "activities",
  activity: "activities",
  transport: "transport",
  lodging: "accommodation",
  shopping: "shopping",
  other: "other",
};

export function activityCategoryToExpenseCategory(c: ActivityCategory): ExpenseCategory {
  return ACTIVITY_TO_EXPENSE_CATEGORY[c];
}

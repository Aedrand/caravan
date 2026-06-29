import type { TripSnapshot } from "@caravan/shared";
import { ExpensesPanel } from "@/components/expenses/expenses-panel";
import { SectionHeading } from "./section-heading";

/**
 * The Money section (§4) — a thin wrapper around `ExpensesPanel`, which already
 * renders the planned-vs-actual `BudgetBar` (V2.6) above the expense list, so we
 * mount it once here rather than a redundant second bar.
 */
export function MoneySection({ snapshot, canEdit }: { snapshot: TripSnapshot; canEdit: boolean }) {
  const { trip, members, activities } = snapshot;
  return (
    <section
      id="money"
      aria-labelledby="money-h"
      tabIndex={-1}
      className="scroll-mt-4 outline-none"
    >
      <SectionHeading id="money" title="Money" glyph="💰" />
      <ExpensesPanel
        tripId={trip.id}
        members={members}
        currency={trip.currency}
        canEdit={canEdit}
        activities={activities}
      />
    </section>
  );
}

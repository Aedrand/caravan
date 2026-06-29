import { budgetStatus } from "@/lib/expenses/budget";
import { formatMoney } from "@/lib/expenses/money";
import { cn } from "@/lib/utils";

/**
 * Planned-vs-actual budget bar (V2.6). A comparison, not a sum: `plannedMinor`
 * is Σ per-activity estimate over dated activities; `actualMinor` is total
 * expense spend. A figures line plus a track whose fill (success/warning/danger
 * soft, by `budgetStatus`) runs to actual/max, with a marker at the planned
 * point. Renders nothing without a plan. Semantic tokens only (TD-11). `compact`
 * is the smaller variant for the future hero band.
 */

const FILL_BG: Record<ReturnType<typeof budgetStatus>, string> = {
  under: "var(--success-soft)",
  warning: "var(--warning-soft)",
  over: "var(--danger-soft)",
};

export function BudgetBar({
  plannedMinor,
  actualMinor,
  currency,
  compact = false,
}: {
  plannedMinor: number;
  actualMinor: number;
  currency: string;
  compact?: boolean;
}) {
  // No plan → nothing to compare against; the caller falls back to a bare total.
  if (plannedMinor === 0) return null;

  const status = budgetStatus(plannedMinor, actualMinor);
  const over = actualMinor > plannedMinor;
  const overByMinor = actualMinor - plannedMinor;

  // The track scales to whichever side is larger, so an overrun visibly spills
  // past the planned marker (fill = 100%, marker sits short of the end).
  const max = Math.max(plannedMinor, actualMinor);
  const fillPct = max > 0 ? Math.min(100, (actualMinor / max) * 100) : 0;
  const plannedPct = max > 0 ? Math.min(100, (plannedMinor / max) * 100) : 0;

  const plannedLabel = formatMoney(plannedMinor, currency);
  const actualLabel = formatMoney(actualMinor, currency);
  const overLabel = formatMoney(overByMinor, currency);
  const sentence = `Planned ${plannedLabel}. Actual ${actualLabel}.${
    over ? ` ${overLabel} over budget.` : ""
  }`;

  return (
    <div
      role="img"
      aria-label={sentence}
      className={cn("flex w-full flex-col", compact ? "gap-1" : "gap-1.5")}
    >
      <p className={cn("flex flex-wrap items-baseline gap-x-1.5", compact ? "text-xs" : "text-sm")}>
        <span className="text-muted-foreground">Planned</span>
        <span
          className={cn(
            "font-display font-bold text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          {plannedLabel}
        </span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span className="text-muted-foreground">Actual</span>
        <span
          className={cn(
            "font-display font-bold text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          {actualLabel}
        </span>
        {over && <span className="font-semibold text-[var(--danger)]">· {overLabel} over</span>}
      </p>

      <div
        aria-hidden
        className={cn(
          "relative w-full overflow-hidden rounded-pill bg-muted",
          compact ? "h-1.5" : "h-2.5",
        )}
      >
        <div
          className="h-full rounded-pill transition-[width]"
          style={{ width: `${fillPct}%`, backgroundColor: FILL_BG[status] }}
        />
        {/* The planned marker — a thin line at the plan point on the track. */}
        <span
          className="absolute inset-y-0 w-0.5 rounded-pill bg-foreground/55"
          style={{ left: `calc(${plannedPct}% - 1px)` }}
        />
      </div>
    </div>
  );
}

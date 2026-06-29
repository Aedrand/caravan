import type { TripMoney } from "@caravan/shared";
import { ChevronDown } from "lucide-react";
import { dayNumber, formatDayShort } from "@/components/itinerary/format";
import { useFocusedDay } from "@/components/map/focused-day";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The V2.7 left index rail (§4). A sticky desktop-only table of contents for the
 * one-canvas workspace: scrollspy drives the active markers, clicking an item
 * smooth-scrolls the canvas, and Itinerary expands to per-day jump buttons. The
 * day click also sets the shared focused day so the ambient map reframes. Mobile
 * uses the BottomNav instead, so this is `hidden lg:flex`.
 */
export interface IndexRailProps {
  days: string[];
  emptyDays: Set<string>;
  activeId: string | null;
  bookingCount: number;
  moneyData: TripMoney | undefined;
  scrollTo: (id: string) => void;
  /** Today's ISO when it falls inside the trip, else null (Today quick-jump). */
  today: string | null;
  /** Trip start ISO — used to number the day items. */
  startDate: string | null;
  canEdit: boolean;
}

export function IndexRail({
  days,
  emptyDays,
  activeId,
  bookingCount,
  moneyData,
  scrollTo,
  today,
  startDate,
}: IndexRailProps) {
  const { setFocusedDay } = useFocusedDay();
  const itineraryActive = activeId === "itinerary" || (activeId?.startsWith("day-") ?? false);
  const moneyCount = moneyData?.expenses.length ?? 0;

  const jumpToDay = (iso: string) => {
    setFocusedDay(iso);
    scrollTo(`day-${iso}`);
  };

  return (
    <nav
      aria-label="Trip contents"
      className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-muted px-3 py-4 lg:flex"
    >
      <p className="px-2.5 pb-2 font-body font-bold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
        Contents
      </p>

      <NavItem
        label="Overview"
        active={activeId === "overview"}
        onClick={() => scrollTo("overview")}
      />

      <NavItem
        label="Bookings"
        active={activeId === "bookings"}
        badge={bookingCount > 0 ? bookingCount : undefined}
        onClick={() => scrollTo("bookings")}
      />

      <NavItem
        label="Itinerary"
        active={itineraryActive}
        onClick={() => scrollTo("itinerary")}
        trailing={
          <ChevronDown
            aria-hidden
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              !itineraryActive && "-rotate-90",
            )}
          />
        }
      />
      {itineraryActive && days.length > 0 && (
        <div className="mt-0.5 mb-1 flex flex-col gap-0.5">
          {days.map((iso) => {
            const n = dayNumber(iso, startDate);
            const dayActive = activeId === `day-${iso}`;
            const dim = emptyDays.has(iso) && !dayActive;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => jumpToDay(iso)}
                aria-current={dayActive ? "true" : undefined}
                className={cn(
                  "ml-2.5 flex items-center gap-2 rounded-r-control border-2 border-transparent border-l-2 py-1.5 pr-2.5 pl-3.5 text-left font-semibold text-[13px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  dayActive
                    ? "ml-2 border-border bg-card font-bold text-foreground shadow-control"
                    : "border-l-[var(--ink-faint)] text-muted-foreground hover:text-foreground",
                  dim && "opacity-55",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full border-2",
                    dayActive ? "border-border bg-primary" : "border-[var(--ink-faint)]",
                  )}
                />
                <span className="truncate">{n != null ? `Day ${n}` : formatDayShort(iso)}</span>
                {n != null && (
                  <span
                    className={cn(
                      "ml-auto shrink-0 font-medium text-[12px]",
                      dayActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatDayShort(iso)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <NavItem
        label="Ideas & Lists"
        active={activeId === "ideas"}
        onClick={() => scrollTo("ideas")}
      />
      <NavItem
        label="Money"
        active={activeId === "money"}
        badge={moneyCount > 0 ? moneyCount : undefined}
        onClick={() => scrollTo("money")}
      />
      <NavItem label="Group" active={activeId === "group"} onClick={() => scrollTo("group")} />

      <div className="mt-auto flex gap-1.5 px-1 pt-3">
        {today != null && (
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => jumpToDay(today)}>
            Today
          </Button>
        )}
        {days.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => jumpToDay(days[0] ?? "")}
          >
            Trip start
          </Button>
        )}
      </div>
    </nav>
  );
}

function NavItem({
  label,
  active,
  badge,
  trailing,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-control border-2 px-2.5 py-2 text-left font-display font-bold text-[15px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "border-border bg-card text-foreground shadow-control"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center">
        <span
          className={cn(
            "size-2 rounded-full border-2",
            active ? "border-border bg-primary" : "border-[var(--ink-faint)]",
          )}
        />
      </span>
      <span className="min-w-0 truncate">{label}</span>
      {badge !== undefined && (
        <span className="ml-auto shrink-0 rounded-pill border-2 border-border bg-accent-soft px-2 py-px font-body font-bold text-[11px] text-foreground">
          {badge}
        </span>
      )}
      {trailing}
    </button>
  );
}

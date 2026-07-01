import type { RouteMode } from "@caravan/shared";
import { Car, Footprints } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The walk/drive segmented control, restyled into Caravan's control language
 * (2px ink border + shadow-control shell; the active segment gets the pressed
 * accent treatment) — the same idiom as the IndexRail items and map day
 * buttons. Shared by the per-day toggle in the itinerary day headers (icons
 * only) and, next wave, the trip-settings dialog (`showLabels`).
 */
export function RouteModeSegmented({
  value,
  onChange,
  showLabels = false,
}: {
  value: RouteMode;
  onChange: (mode: RouteMode) => void;
  showLabels?: boolean;
}) {
  return (
    <span
      role="toolbar"
      aria-label="Travel mode"
      className="inline-flex items-center gap-0.5 rounded-control border-2 border-border bg-card p-0.5 shadow-control"
    >
      {(["walking", "driving"] as const).map((m) => {
        const Icon = m === "driving" ? Car : Footprints;
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            aria-label={m === "walking" ? "Walk" : "Drive"}
            title={m === "walking" ? "Walk" : "Drive"}
            className={cn(
              "flex items-center gap-1 rounded-control px-2 py-1 font-body font-bold text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "bg-accent-soft text-foreground shadow-pressed"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
            {showLabels && <span>{m === "walking" ? "Walk" : "Drive"}</span>}
          </button>
        );
      })}
    </span>
  );
}

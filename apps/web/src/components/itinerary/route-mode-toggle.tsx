import type { RouteMode } from "@caravan/shared";
import { cn } from "@/lib/utils";

/**
 * The walk/drive control as labeled ink stamps (owner-ratified 2026-07-01):
 * two contiguous text segments — WALK / DRIVE in small display caps — inside
 * one 2px-ink rounded-control shell, the active segment carrying the same
 * accent-soft + shadow-pressed treatment as the itinerary's DAY n stamp.
 * Deliberately text-first with no glyphs: the words are the control's
 * identity. Shared by the per-day toggle in the day headers and the
 * trip-settings dialog.
 */
export function RouteModeSegmented({
  value,
  onChange,
}: {
  value: RouteMode;
  onChange: (mode: RouteMode) => void;
}) {
  return (
    <span
      role="toolbar"
      aria-label="Travel mode"
      className="inline-flex items-stretch overflow-hidden rounded-stamp border-2 border-border bg-card shadow-control"
    >
      {(["walking", "driving"] as const).map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={cn(
              "px-2 py-0.5 font-display font-bold text-[10px] uppercase tracking-wide outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
              m === "driving" && "border-l-2 border-border",
              active
                ? "bg-accent-soft text-foreground shadow-pressed"
                : "text-muted-foreground hover:bg-accent-soft/40 hover:text-foreground",
            )}
          >
            {m === "walking" ? "Walk" : "Drive"}
          </button>
        );
      })}
    </span>
  );
}

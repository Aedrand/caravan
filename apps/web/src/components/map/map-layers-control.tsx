import { Layers } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LayerGroup } from "./geo-features";

/**
 * Compact map layers control (V2.8 map pass): a small pill button that expands
 * a popover with per-day and per-idea-list pin toggles. Replaces the
 * permanently-open "Days" toolbar card, which ate map area — this DEFAULTS
 * CLOSED and shows only an icon (plus an "N hidden" badge when filters are
 * active) until the user opens it.
 *
 * Pure presentation: the group rows come from `buildDayGroups` /
 * `buildListGroups` (geo-features.ts) and the hidden-set state lives in
 * MapView, which applies it at the GeoJSON DATA level (never a MapLibre layer
 * filter — see the clustering-correctness note there). Renders nothing when
 * there's nothing worth toggling: fewer than 2 day groups AND no list groups
 * (a rescue exception: a Days group with a still-hidden day always shows, so a
 * hidden day can't get stranded if the trip shrinks to one day group).
 */
export function MapLayersControl({
  dayGroups,
  listGroups,
  hiddenDays,
  hiddenLists,
  onToggleDay,
  onToggleList,
  onShowAllDays,
  onShowAllLists,
}: {
  dayGroups: LayerGroup[];
  listGroups: LayerGroup[];
  hiddenDays: Set<string>;
  hiddenLists: Set<string>;
  onToggleDay: (key: string) => void;
  onToggleList: (key: string) => void;
  onShowAllDays: () => void;
  onShowAllLists: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Count only hidden keys that still map to a real group — a stale hidden key
  // (its pins all deleted) shouldn't inflate the badge.
  const hiddenDayCount = dayGroups.filter((g) => hiddenDays.has(g.key)).length;
  const hiddenListCount = listGroups.filter((g) => hiddenLists.has(g.key)).length;
  const hiddenCount = hiddenDayCount + hiddenListCount;

  // A single day group has nothing to filter (matching the old toolbar's ≥2
  // threshold) — unless one of its days is hidden and needs a way back.
  const showDays = dayGroups.length >= 2 || hiddenDayCount > 0;
  const showLists = listGroups.length > 0;

  // Light dismissal for the popover: outside pointerdown or Escape closes it
  // (Escape also restores focus to the trigger). Bound only while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!showDays && !showLists) return null;

  return (
    <div ref={rootRef} className="absolute top-3 left-3 z-10">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={hiddenCount > 0 ? `Map layers, ${hiddenCount} hidden` : "Map layers"}
        className="cv-control flex items-center gap-1.5 bg-card px-2 py-1.5 font-body font-semibold text-foreground text-xs"
      >
        <Layers aria-hidden className="size-4" />
        {hiddenCount > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {hiddenCount} hidden
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Map layers"
          className="cv-card absolute top-full left-0 z-10 mt-2 flex max-h-64 w-max max-w-[min(70vw,16rem)] flex-col gap-2.5 overflow-y-auto p-2"
        >
          {showDays && (
            <LayerToggleGroup
              title="Days"
              groups={dayGroups}
              hidden={hiddenDays}
              onToggle={onToggleDay}
              onShowAll={onShowAllDays}
            />
          )}
          {showLists && (
            <LayerToggleGroup
              title="Lists"
              groups={listGroups}
              hidden={hiddenLists}
              onToggle={onToggleList}
              onShowAll={onShowAllLists}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** One toggle group (Days / Lists): title, an "All" reset when anything's
 *  hidden, and a wrap-row of pressed-state pill toggles (the same pill idiom the
 *  old day toolbar used). */
function LayerToggleGroup({
  title,
  groups,
  hidden,
  onToggle,
  onShowAll,
}: {
  title: string;
  groups: LayerGroup[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
}) {
  const anyHidden = groups.some((g) => hidden.has(g.key));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="sr-only">Filter pins by {title.toLowerCase()}</legend>
      <div className="flex items-baseline justify-between gap-2">
        <p
          aria-hidden
          className="px-0.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide"
        >
          {title}
        </p>
        {anyHidden && (
          <button
            type="button"
            onClick={onShowAll}
            className="rounded-control px-1.5 py-0.5 font-semibold text-[11px] text-muted-foreground hover:text-foreground"
          >
            All
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {groups.map(({ key, label, count, color }) => {
          const visible = !hidden.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={visible}
              className={cn(
                "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-control border-2 px-2 py-0.5 font-body font-semibold text-xs transition-colors",
                visible
                  ? "border-border bg-card text-foreground shadow-control"
                  : "border-transparent text-muted-foreground opacity-55 hover:text-foreground",
              )}
            >
              {/* Swatch = this layer's pin color (canonical day/list ordinal,
                  decorated on by MapView) — inline style, since the ramps are
                  runtime hex that Tailwind can't know. */}
              {color && (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
              )}
              {label}
              <span className="text-[10px] tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

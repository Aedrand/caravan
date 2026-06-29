import type { Coord, RouteLeg, RouteMode } from "@caravan/shared";
import { ArrowUpRight, Car, Footprints } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistance, formatDuration } from "@/lib/routing";
import { SpineColumn } from "./rail-row";

export interface TravelLegRowProps {
  /** The resolved leg between the two stops, or null when the route proxy had
   * no path for it (graceful-off) — then we show a muted placeholder, no link. */
  leg: RouteLeg | null;
  /** A route fetch is in flight for this leg — show the skeleton pulse. */
  isLoading: boolean;
  /** The upstream stop's resolved coordinate (directions origin). */
  fromCoord: Coord;
  /** The downstream stop's resolved coordinate (directions destination). */
  toCoord: Coord;
  /** Walking vs driving — drives the glyph and the link's `travelmode`. */
  mode: RouteMode;
  /** When placed among editable/draggable stop rows, reserve the same
   * `-ml-1 w-6 shrink-0` grip column those rows use so the connector spine lines
   * up beneath them (mirrors `DerivedEntryRow`). Off by default — viewers and
   * bare call sites get no grip. */
  canEdit?: boolean;
}

/**
 * The link-out to turn-by-turn directions (PD-12 link-out style): a keyless
 * Google Maps Directions URL that opens in a new tab. Coordinates go in
 * `lat,lng` order; `travelmode` is the user-facing mode name 1:1 with
 * `walking`/`driving`.
 */
function directionsUrl(from: Coord, to: Coord, mode: RouteMode): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: mode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * A read-only, NON-draggable rail row for the travel leg BETWEEN two consecutive
 * plotted stops (V2.5 — Routing). It threads the same connector spine as the
 * real rows (via `SpineColumn`, isFirst/isLast both false so the 2px line runs
 * the full row height and the rail flows unbroken through the leg), but carries
 * no number stamp, no mark, and no drag handle — it's a derived display artifact
 * describing the hop, not an activity.
 *
 * Three states:
 *  - loading → a one-line `Skeleton` pulse;
 *  - leg present → `[mode icon] {duration} · {distance}` + a `+ directions ↗`
 *    link-out;
 *  - leg null (route unavailable) → a muted `— · —` with no link.
 *
 * A11y: the duration/distance line is supplementary and marked `aria-hidden`;
 * the directions `<a>` is the lone meaningful, focusable element and carries the
 * descriptive label.
 */
export function TravelLegRow({
  leg,
  isLoading,
  fromCoord,
  toCoord,
  mode,
  canEdit = false,
}: TravelLegRowProps) {
  const ModeIcon = mode === "driving" ? Car : Footprints;

  return (
    <li className="group relative flex gap-2 pr-1">
      {/* Mirror the sortable rows' grip column so the spine lines up beneath it. */}
      {canEdit && <span aria-hidden className="-ml-1 w-6 shrink-0" />}
      {/* isFirst/isLast both false → a full-height connector, so the spine line
          flows straight through this between-stops row. No mark sits on it. */}
      <SpineColumn isFirst={false} isLast={false}>
        {null}
      </SpineColumn>

      <div className="flex min-w-0 flex-1 items-center gap-2 py-1 text-xs text-muted-foreground">
        {isLoading ? (
          <Skeleton className="h-3.5 w-40 rounded-sm" />
        ) : leg ? (
          <>
            <span aria-hidden className="inline-flex min-w-0 items-center gap-1.5">
              <ModeIcon className="size-3.5 shrink-0" strokeWidth={2.25} />
              <span className="truncate">
                {formatDuration(leg.durationSeconds)} · {formatDistance(leg.distanceMeters)}
              </span>
            </span>
            <a
              href={directionsUrl(fromCoord, toCoord, mode)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Directions (${mode}) to the next stop`}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-sm font-medium underline decoration-dotted underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              + directions
              <ArrowUpRight aria-hidden className="size-3 shrink-0" />
            </a>
          </>
        ) : (
          /* Route unavailable for this leg — supplementary and link-less, so the
             whole line is decorative to assistive tech. */
          <span aria-hidden className="inline-flex items-center gap-1.5 text-muted-foreground/70">
            <ModeIcon className="size-3.5 shrink-0 opacity-60" strokeWidth={2.25} />— · —
          </span>
        )}
      </div>
    </li>
  );
}

import type { DerivedEntry } from "@caravan/shared";
import { ArrowUpRight } from "lucide-react";
import { formatTime } from "./format";
import { SpineColumn, SpineMark } from "./rail-row";

/**
 * A read-only, NON-draggable rail row for a booking-derived entry (V2.4): the
 * check-out a lodging spawns on its last day, or the arrival an overnight flight
 * spawns on its landing day. The source booking lives on its own day; this row
 * surfaces the "other end" on the day it actually happens. It threads the same
 * connector spine as the real rows (via `SpineColumn`) and wears the booking's
 * mark (check-out → lodging glyph, arrival → flight glyph), but carries no
 * number stamp and no drag handle — it's a display artifact, not an activity.
 * Hovering reveals an affordance that jumps to the source booking
 * (`onOpenBooking`), which opens it in the edit dialog.
 */
export function DerivedEntryRow({
  entry,
  isFirst,
  isLast,
  canEdit,
  onOpenBooking,
}: {
  entry: DerivedEntry;
  /** Position in the day's FULL row list — drives the spine connector ends. */
  isFirst: boolean;
  isLast: boolean;
  /** Editors get a drag-handle-width spacer so the spine aligns with the
   * sortable rows (which reserve a grip column); viewers have no grip. */
  canEdit: boolean;
  onOpenBooking?: (bookingId: string) => void;
}) {
  const isCheckOut = entry.kind === "check-out";
  const prefix = isCheckOut ? "Check out" : "Arrives";
  const time = entry.time ? formatTime(entry.time) : null;

  const label = (
    <span className="min-w-0 truncate">
      <span className="font-semibold text-foreground">{prefix}</span>
      {entry.placeName && <span className="text-muted-foreground"> — {entry.placeName}</span>}
      {time && <span className="text-muted-foreground"> · {time}</span>}
    </span>
  );

  return (
    <li className="group relative flex gap-2 pr-1">
      {/* Mirror the sortable rows' grip column so the spine lines up beneath it. */}
      {canEdit && <span aria-hidden className="-ml-1 w-6 shrink-0" />}
      <SpineColumn isFirst={isFirst} isLast={isLast}>
        <SpineMark type={isCheckOut ? "lodging" : "flight"} />
      </SpineColumn>
      <div className="min-w-0 flex-1 py-2">
        {onOpenBooking ? (
          <button
            type="button"
            onClick={() => onOpenBooking(entry.sourceBookingId)}
            title="Open the booking"
            className="flex w-full min-w-0 items-center gap-1.5 rounded-sm text-left text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {label}
            <ArrowUpRight
              aria-hidden
              className="size-3.5 shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            />
          </button>
        ) : (
          <div className="flex min-w-0 items-center text-sm">{label}</div>
        )}
      </div>
    </li>
  );
}

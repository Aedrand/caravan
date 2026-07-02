import type { TripSnapshot } from "@caravan/shared";
import { Luggage, Plus } from "lucide-react";
import type { RefObject } from "react";
import { ItineraryBoard, type ItineraryBoardHandle } from "@/components/itinerary/itinerary-board";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "./section-heading";

/**
 * The Itinerary section (§8). A thin wrapper that lifts the (desktop)
 * "Add activity" button — formerly inside `ItineraryBoard`'s sticky DayRail —
 * into the canvas section heading, then renders the board itself (now
 * toolbar-free). The trip-wide travel-mode default moved to the Trip settings
 * dialog (the per-day toggles stay in the day headers); the day-jump buttons
 * (Today / Trip start) live only in the IndexRail foot (v2.8 declutter — they
 * used to be duplicated here). The "Add activity" button is the e2e anchor
 * (gotcha #5): desktop-only, since the mobile add path is the thumb FAB.
 */
export function ItinerarySection({
  snapshot,
  canEdit,
  boardRef,
}: {
  snapshot: TripSnapshot;
  canEdit: boolean;
  boardRef: RefObject<ItineraryBoardHandle | null>;
}) {
  return (
    <section
      id="itinerary"
      aria-labelledby="itinerary-h"
      tabIndex={-1}
      className="scroll-mt-4 outline-none"
    >
      <SectionHeading
        id="itinerary"
        title="Itinerary"
        icon={Luggage}
        actions={
          canEdit && (
            // Desktop-only: on mobile the thumb FAB is the sole add path, so this
            // would otherwise be a second control with the same accessible name.
            <Button
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => boardRef.current?.addActivity()}
            >
              <Plus aria-hidden />
              Add activity
            </Button>
          )
        }
      />
      <ItineraryBoard snapshot={snapshot} canEdit={canEdit} handleRef={boardRef} />
    </section>
  );
}

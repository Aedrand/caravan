import type { RouteMode, TripSnapshot } from "@caravan/shared";
import { Plus } from "lucide-react";
import type { RefObject } from "react";
import { deriveDays, todayIso } from "@/components/itinerary/format";
import {
  ItineraryBoard,
  type ItineraryBoardHandle,
  TripRouteModeToggle,
} from "@/components/itinerary/itinerary-board";
import { Button } from "@/components/ui/button";
import { useTripMutation } from "@/lib/sync";
import { SectionHeading } from "./section-heading";

/**
 * The Itinerary section (§8). A thin wrapper that lifts the day-jump controls,
 * the trip-wide travel-mode toggle, and the (desktop) "Add activity" button —
 * all formerly inside `ItineraryBoard`'s sticky DayRail — into the canvas
 * section heading, then renders the board itself (now toolbar-free). The
 * "Add activity" button is the e2e anchor (gotcha #5): desktop-only, since the
 * mobile add path is the thumb FAB.
 */
export function ItinerarySection({
  snapshot,
  canEdit,
  boardRef,
  scrollTo,
}: {
  snapshot: TripSnapshot;
  canEdit: boolean;
  boardRef: RefObject<ItineraryBoardHandle | null>;
  scrollTo: (id: string) => void;
}) {
  const { trip, activities } = snapshot;
  const { mutateAsync } = useTripMutation();

  const days = deriveDays(trip.startDate, trip.endDate, activities);
  const today = todayIso();
  const todayInTrip = days.includes(today);

  const setDefaultRouteMode = (mode: RouteMode) =>
    void mutateAsync("trip.update", { defaultRouteMode: mode }).catch(() => {});

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
        glyph="🧳"
        actions={
          <>
            {todayInTrip && (
              <Button variant="secondary" size="sm" onClick={() => scrollTo(`day-${today}`)}>
                Today
              </Button>
            )}
            {days.length > 1 && (
              <Button
                variant="secondary"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => scrollTo(`day-${days[0] ?? ""}`)}
              >
                Trip start
              </Button>
            )}
            {canEdit && (
              <TripRouteModeToggle mode={trip.defaultRouteMode} onChange={setDefaultRouteMode} />
            )}
            {canEdit && (
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
            )}
          </>
        }
      />
      <ItineraryBoard snapshot={snapshot} canEdit={canEdit} handleRef={boardRef} />
    </section>
  );
}

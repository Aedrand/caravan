import type { TripSnapshot } from "@caravan/shared";
import { Lightbulb } from "lucide-react";
import { IdeasPanel } from "@/components/decisions/ideas-panel";
import { PollsPanel } from "@/components/decisions/polls-panel";
import { SectionHeading } from "./section-heading";

/**
 * The Ideas & Lists section (§4) — a thin wrapper pairing the idea pool with the
 * polls panel under one canvas heading.
 */
export function IdeasSection({ snapshot, canEdit }: { snapshot: TripSnapshot; canEdit: boolean }) {
  return (
    <section
      id="ideas"
      aria-labelledby="ideas-h"
      tabIndex={-1}
      className="scroll-mt-4 outline-none"
    >
      <SectionHeading id="ideas" title="Ideas & Lists" icon={Lightbulb} />
      <div className="flex flex-col gap-8">
        <IdeasPanel snapshot={snapshot} canEdit={canEdit} />
        <PollsPanel snapshot={snapshot} canEdit={canEdit} />
      </div>
    </section>
  );
}

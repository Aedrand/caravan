import { Users } from "lucide-react";
import { MembersPanel } from "@/components/trips/members-panel";
import { SectionHeading } from "./section-heading";

/**
 * The Group section (§4) — a thin wrapper around `MembersPanel` (which pulls its
 * own data from the trip-snapshot context, so it takes no props).
 */
export function GroupSection() {
  return (
    <section
      id="group"
      aria-labelledby="group-h"
      tabIndex={-1}
      className="scroll-mt-4 outline-none"
    >
      <SectionHeading id="group" title="Group" icon={Users} />
      <MembersPanel />
    </section>
  );
}

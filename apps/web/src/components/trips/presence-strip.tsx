import { FALLBACK_PERSON_COLOR } from "@/lib/person-colors";
import { usePresence } from "@/lib/sync";

/**
 * Who's in the trip right now (live presence, not the full member list) — a
 * cluster of person-colored avatars each with an online dot. Colors come from
 * the same join-order map the itinerary uses, so a member is one color
 * everywhere.
 */
export function PresenceStrip({ colors }: { colors: Map<string, string> }) {
  const { members } = usePresence();
  if (members.length === 0) return null;

  return (
    <ul
      className="hidden -space-x-2 sm:flex"
      aria-label={members.length === 1 ? "1 person here now" : `${members.length} people here now`}
    >
      {members.map((member) => (
        <li
          key={member.memberId}
          title={`${member.name} · here now`}
          className="relative flex size-8 select-none items-center justify-center rounded-full border-2 border-background text-xs font-semibold uppercase text-white"
          style={{ backgroundColor: colors.get(member.memberId) ?? FALLBACK_PERSON_COLOR }}
        >
          <span aria-hidden>{member.name.trim().charAt(0) || "?"}</span>
          <span className="sr-only">{member.name} is here now</span>
          <span
            aria-hidden
            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500"
          />
        </li>
      ))}
    </ul>
  );
}

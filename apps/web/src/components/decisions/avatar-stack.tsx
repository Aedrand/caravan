import type { TripMember } from "@caravan/shared";
import { FALLBACK_PERSON_COLOR } from "@/lib/person-colors";
import { cn } from "@/lib/utils";

/**
 * A compact overlapping stack of person-colored initials — the visible-voters
 * affordance (PD-2/PD-3): in a group of friends, *who* is in is the signal.
 */
export function AvatarStack({
  memberIds,
  membersById,
  colors,
  max = 5,
  size = "sm",
}: {
  memberIds: string[];
  membersById: Map<string, TripMember>;
  colors: Map<string, string>;
  max?: number;
  size?: "sm" | "xs";
}) {
  if (memberIds.length === 0) return null;
  const shown = memberIds.slice(0, max);
  const overflow = memberIds.length - shown.length;
  const dim = size === "xs" ? "size-5 text-[10px]" : "size-6 text-[11px]";

  return (
    <div className="flex items-center">
      {shown.map((id, i) => {
        const member = membersById.get(id);
        const name = member?.name ?? "?";
        return (
          <span
            key={id}
            title={name}
            className={cn(
              "flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase text-white ring-2 ring-card",
              dim,
              i > 0 && "-ml-1.5",
            )}
            style={{ backgroundColor: colors.get(id) ?? FALLBACK_PERSON_COLOR }}
          >
            {name.trim().charAt(0) || "?"}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className={cn(
            "-ml-1.5 flex shrink-0 select-none items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card",
            dim,
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

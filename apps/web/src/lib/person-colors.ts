/**
 * Stable per-member avatar color, assigned by join order and expressed as a
 * semantic `--person-N` token (TD-11) so it re-tints with the active theme.
 * Pass the members in a stable order (e.g. active members by joinedAt).
 */
export function personColors(members: { id: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  members.forEach((member, i) => {
    map.set(member.id, `var(--person-${(i % 6) + 1})`);
  });
  return map;
}

export const FALLBACK_PERSON_COLOR = "var(--person-1)";

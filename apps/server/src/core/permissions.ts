import type { Role } from "@caravan/shared";

/** Role lattice (PD-10): viewer < editor < owner. */
const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

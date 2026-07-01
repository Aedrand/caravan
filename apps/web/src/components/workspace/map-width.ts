/**
 * Pure width math + persistence for the resizable ambient-map track. The drag
 * handle sits on the LEFT edge of the map column, so dragging LEFT (toward the
 * canvas) widens the map. Kept UI-free so the clamp/drag/persist rules are
 * unit-testable without pointer events (house pure-logic split).
 */
export const MAP_WIDTH_STORAGE_KEY = "caravan:workspace:map-width";
export const MAP_WIDTH_DEFAULT = 460;
export const MAP_WIDTH_MIN = 320;
export const MAP_WIDTH_MAX = 720;

/** Clamp to the track's [MIN, MAX] band; junk (NaN/±∞) falls to the default. */
export function clampMapWidth(n: number): number {
  if (!Number.isFinite(n)) return MAP_WIDTH_DEFAULT;
  return Math.min(MAP_WIDTH_MAX, Math.max(MAP_WIDTH_MIN, Math.round(n)));
}

/** Handle sits LEFT of the map track: dragging left (currentX < startX) widens. */
export function nextWidthFromDrag(startWidth: number, startX: number, currentX: number): number {
  return clampMapWidth(startWidth + (startX - currentX));
}

/** Read the persisted width; missing key / garbage / throwing storage → default. */
export function readStoredMapWidth(storage?: Pick<Storage, "getItem">): number {
  try {
    const raw = storage?.getItem(MAP_WIDTH_STORAGE_KEY);
    if (raw == null) return MAP_WIDTH_DEFAULT;
    return clampMapWidth(Number.parseFloat(raw));
  } catch {
    return MAP_WIDTH_DEFAULT;
  }
}

/** Persist the width, best-effort — swallow private-mode/quota setItem throws. */
export function writeStoredMapWidth(
  storage: Pick<Storage, "setItem"> | undefined,
  width: number,
): void {
  try {
    storage?.setItem(MAP_WIDTH_STORAGE_KEY, String(clampMapWidth(width)));
  } catch {
    // Persistence is cosmetic; losing it must never break the resize itself.
  }
}

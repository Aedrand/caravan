import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Ordering keys for drag-to-reorder (TD-1, the Figma pattern): a new key
 * sorts lexicographically between its neighbors, so concurrent reorders of
 * different items merge cleanly and concurrent moves of the same item
 * resolve by last-write-wins on the column.
 */

/** Key for the first item in an empty list. */
export function firstPosition(): string {
  return generateKeyBetween(null, null);
}

/** Key strictly between two neighbors (null = open end). */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** N evenly distributed keys (bulk insert, duplicate-as-template). */
export function positionsBetween(before: string | null, after: string | null, n: number): string[] {
  return generateNKeysBetween(before, after, n);
}

/** Milliseconds since the Unix epoch — the only timestamp unit in Caravan (TD-3). */
export type EpochMs = number;

export function now(): EpochMs {
  return Date.now();
}

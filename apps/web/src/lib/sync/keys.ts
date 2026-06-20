/** React Query cache keys for trip data — one source so writes and invalidations line up. */
export const tripKeys = {
  list: ["trips"] as const,
  snapshot: (tripId: string) => ["trip", tripId] as const,
  feed: (tripId: string) => ["trip", tripId, "feed"] as const,
  seen: (tripId: string) => ["trip", tripId, "seen"] as const,
};

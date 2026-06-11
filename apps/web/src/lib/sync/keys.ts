/** React Query cache keys for trip data — one source so writes and invalidations line up. */
export const tripKeys = {
  list: ["trips"] as const,
  snapshot: (tripId: string) => ["trip", tripId] as const,
};

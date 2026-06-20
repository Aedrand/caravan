import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useFeed } from "@/lib/sync";
import type { TripMoney } from "@/lib/sync/shared";

/**
 * Track B money read hook. Expenses & payments live outside the trip snapshot;
 * we fetch them here and keep them live by watching the feed. When the newest
 * feed event is an expense/payment mutation, we invalidate this query — the
 * mutation pipeline already broadcast the event, the feed already prepended it
 * (sync lib), so this just re-pulls the authoritative money state.
 */
const moneyKey = (tripId: string) => ["trip", tripId, "money"] as const;

const MONEY_EVENT_PREFIXES = ["expense.", "payment."];

export function useMoney(tripId: string): UseQueryResult<TripMoney, Error> {
  const queryClient = useQueryClient();
  const feedQuery = useFeed(tripId);
  const query = useQuery({
    queryKey: moneyKey(tripId),
    queryFn: () => apiFetch<TripMoney>(`/api/trips/${tripId}/money`),
    // Kept fresh by the feed watcher below; never refetch on a timer.
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Refetch whenever the newest feed event is a money mutation. Keyed on the
  // latest event id so we react once per new event, including our own writes.
  const latestEvent = feedQuery.data?.events[0];
  const latestMoneyEventId =
    latestEvent && MONEY_EVENT_PREFIXES.some((p) => latestEvent.type.startsWith(p))
      ? latestEvent.id
      : null;
  useEffect(() => {
    if (latestMoneyEventId) {
      queryClient.invalidateQueries({ queryKey: moneyKey(tripId) });
    }
  }, [latestMoneyEventId, tripId, queryClient]);

  return query;
}

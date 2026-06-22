import {
  type QueryClient,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import { tripKeys } from "./keys";
import type { FeedEvent } from "./shared";

/** A page of the activity feed (PD-7): newest first, with more behind it. */
export interface FeedPage {
  events: FeedEvent[];
  hasMore: boolean;
}

/** Newest feed events for a trip; the socket keeps it live via appendFeedEvent. */
export function useFeed(tripId: string): UseQueryResult<FeedPage, Error> {
  return useQuery({
    queryKey: tripKeys.feed(tripId),
    queryFn: () => apiFetch<FeedPage>(`/api/trips/${tripId}/events?before=&limit=50`),
    // Live updates arrive over the socket; never refetch on a timer.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** This member's last-seen feed version (drives unread count + catch-up divider). */
export function useSeen(tripId: string): UseQueryResult<{ version: number }, Error> {
  return useQuery({
    queryKey: tripKeys.seen(tripId),
    queryFn: () => apiFetch<{ version: number }>(`/api/trips/${tripId}/seen`),
  });
}

/** How many feed events are newer than this member's seen cursor (bell badge + pill). */
export function useUnreadCount(tripId: string): number {
  const feedQuery = useFeed(tripId);
  const seenQuery = useSeen(tripId);
  const seen = seenQuery.data?.version ?? 0;
  return (feedQuery.data?.events ?? []).filter((e) => e.version > seen).length;
}

/** Advance this member's seen cursor; the server clamps it forward-only.
 *  Returns react-query's stable `mutate`, safe to use in effect deps. */
export function useMarkSeen(tripId: string): (version: number) => void {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (version: number) =>
      apiPost<{ version: number }>(`/api/trips/${tripId}/seen`, { version }),
    onSuccess: (data) => queryClient.setQueryData(tripKeys.seen(tripId), data),
  });
  return mutation.mutate;
}

/**
 * Prepend a live event to the cached feed (deduped by id — the POST response
 * and its WS echo are the same event). No-op when the feed isn't loaded; it'll
 * fetch fresh, including this event, when the panel next opens.
 */
export function appendFeedEvent(queryClient: QueryClient, tripId: string, event: FeedEvent): void {
  queryClient.setQueryData<FeedPage>(tripKeys.feed(tripId), (old) => {
    if (!old) return old;
    if (old.events.some((e) => e.id === event.id)) return old;
    return { ...old, events: [event, ...old.events] };
  });
}

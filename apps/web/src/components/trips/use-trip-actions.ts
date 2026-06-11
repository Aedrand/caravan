import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { apiFetch, apiPost } from "@/lib/api";
import { tripKeys } from "@/lib/sync";
import { createId, type MutationResponse, type Trip } from "@/lib/sync/shared";

/**
 * Trip-level REST actions shared by the dashboard cards and the trip page
 * header menu. Archive/unarchive lives here only for the dashboard (plain
 * mutation envelope over REST); inside a <TripSyncProvider> use
 * useTripMutation("trip.archive"/"trip.unarchive") instead so the change
 * applies optimistically.
 */

export function useDuplicateTrip(tripId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => apiPost<{ trip: Trip }>(`/api/trips/${tripId}/duplicate`, {}),
    onSuccess: async ({ trip }) => {
      await queryClient.invalidateQueries({ queryKey: tripKeys.list });
      await navigate({ to: "/trips/$tripId", params: { tripId: trip.id } });
    },
  });
}

export function useDeleteTrip(tripId: string, options: { onDeleted?: () => Promise<void> } = {}) {
  const queryClient = useQueryClient();
  const { onDeleted } = options;
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>(`/api/trips/${tripId}`, { method: "DELETE" }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: tripKeys.snapshot(tripId) });
      await queryClient.invalidateQueries({ queryKey: tripKeys.list });
      await onDeleted?.();
    },
  });
}

/** Dashboard-only archive toggle — POSTs a mutation envelope, then refreshes the list. */
export function useArchiveTripFromList(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: "trip.archive" | "trip.unarchive") =>
      apiPost<MutationResponse>(`/api/trips/${tripId}/mutations`, {
        id: createId(),
        type,
        payload: {},
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.list }),
  });
}

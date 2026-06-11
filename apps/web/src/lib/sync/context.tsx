import {
  type QueryClient,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch, apiPost } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { applyEvent, applyMutationOptimistic } from "./apply";
import { tripKeys } from "./keys";
import {
  createId,
  type EntityPostImage,
  entityPostImageSchemas,
  type FeedEvent,
  type Mutation,
  type MutationPayload,
  type MutationResponse,
  type MutationType,
  type PresenceState,
  type PresenceView,
  type ServerWsMessage,
  type TripMember,
  type TripSnapshot,
} from "./shared";
import { type ConnectionStatus, TripSocket } from "./socket";

/**
 * The React face of the sync lib (plan §3.4): one provider per mounted trip
 * owns the socket; hooks read/write the shared React Query snapshot cache.
 */

interface TripSyncContextValue {
  tripId: string;
  presenceMembers: PresenceState[];
  status: ConnectionStatus;
  sendPresence: (view: PresenceView) => void;
  /**
   * Highest trip version the socket has reported (hello or event). Events
   * that arrive before the snapshot query has data can't be applied — this
   * watermark lets useTripSnapshot detect a fetched snapshot that predates
   * them and refetch instead of diverging silently.
   */
  latestSeenVersion: { current: number };
}

const TripSyncContext = createContext<TripSyncContextValue | null>(null);

function useTripSyncContext(hookName: string): TripSyncContextValue {
  const ctx = useContext(TripSyncContext);
  if (!ctx) {
    throw new Error(`${hookName} must be used within a <TripSyncProvider> for the trip`);
  }
  return ctx;
}

/** Refine an unknown post-image with the schema for the event's entity type. */
function refineEntity(
  event: FeedEvent,
  entity: unknown,
): { ok: true; entity: EntityPostImage | null } | { ok: false } {
  if (entity == null) return { ok: true, entity: null };
  const parsed = entityPostImageSchemas[event.entityType].safeParse(entity);
  return parsed.success ? { ok: true, entity: parsed.data } : { ok: false };
}

type SyncMessage = Extract<ServerWsMessage, { kind: "hello" | "event" }>;

function recordSeenVersion(latestSeen: { current: number }, version: number): void {
  if (version > latestSeen.current) latestSeen.current = version;
}

/**
 * Apply an authoritative event to the cached snapshot — the ONE reconcile
 * path shared by WS frames and POST responses, so both get the same
 * version-gap handling (a gap means something was missed: refetch).
 */
function reconcileEvent(
  queryClient: QueryClient,
  tripId: string,
  event: FeedEvent,
  entity: EntityPostImage | null,
): void {
  const snapshotKey = tripKeys.snapshot(tripId);
  let gap = false;
  queryClient.setQueryData<TripSnapshot>(snapshotKey, (old) => {
    if (!old) return old;
    if (event.version > old.trip.version + 1) {
      gap = true; // non-contiguous — something was missed
      return old;
    }
    return applyEvent(old, event, entity);
  });
  if (gap) {
    queryClient.invalidateQueries({ queryKey: snapshotKey });
  }
  if (event.entityType === "trip") {
    // The dashboard list renders trip names/archive state — keep it fresh.
    queryClient.invalidateQueries({ queryKey: tripKeys.list });
  }
}

function handleSyncMessage(
  queryClient: QueryClient,
  tripId: string,
  latestSeen: { current: number },
  msg: SyncMessage,
): void {
  const snapshotKey = tripKeys.snapshot(tripId);

  if (msg.kind === "hello") {
    recordSeenVersion(latestSeen, msg.version);
    const cached = queryClient.getQueryData<TripSnapshot>(snapshotKey);
    if (cached && msg.version > cached.trip.version) {
      // Events were missed while disconnected — refetch the authoritative snapshot.
      queryClient.invalidateQueries({ queryKey: snapshotKey });
    }
    return;
  }

  const { event } = msg;
  recordSeenVersion(latestSeen, event.version);
  const refined = refineEntity(event, msg.entity);
  if (!refined.ok) {
    console.error(`[sync] bad ${event.entityType} post-image on event ${event.id} — refetching`);
    queryClient.invalidateQueries({ queryKey: snapshotKey });
    return;
  }
  reconcileEvent(queryClient, tripId, event, refined.entity);
}

export function TripSyncProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [presenceMembers, setPresenceMembers] = useState<PresenceState[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<TripSocket | null>(null);
  const latestSeenVersion = useRef(0);

  useEffect(() => {
    const socket = new TripSocket({
      tripId,
      onStatus: setStatus,
      onMessage: (msg) => {
        if (msg.kind === "presence") {
          setPresenceMembers(msg.members);
          return;
        }
        handleSyncMessage(queryClient, tripId, latestSeenVersion, msg);
      },
    });
    socketRef.current = socket;
    socket.connect();
    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [tripId, queryClient]);

  const sendPresence = useCallback((view: PresenceView) => {
    socketRef.current?.sendPresence(view);
  }, []);

  const value = useMemo(
    () => ({ tripId, presenceMembers, status, sendPresence, latestSeenVersion }),
    [tripId, presenceMembers, status, sendPresence],
  );

  return <TripSyncContext.Provider value={value}>{children}</TripSyncContext.Provider>;
}

export function useTripSnapshot(): UseQueryResult<TripSnapshot, Error> {
  const { tripId, latestSeenVersion } = useTripSyncContext("useTripSnapshot");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: tripKeys.snapshot(tripId),
    queryFn: () => apiFetch<TripSnapshot>(`/api/trips/${tripId}/snapshot`),
    // The socket keeps the snapshot fresh; never refetch on a timer.
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Heal the load race: frames that arrive before the snapshot lands can't be
  // applied, and a snapshot read before those commits would otherwise sit
  // stale forever (no timer, no further events on a quiet trip).
  const fetchedVersion = query.data?.trip.version;
  useEffect(() => {
    if (fetchedVersion !== undefined && fetchedVersion < latestSeenVersion.current) {
      queryClient.invalidateQueries({ queryKey: tripKeys.snapshot(tripId) });
    }
  }, [fetchedVersion, tripId, queryClient, latestSeenVersion]);

  return query;
}

/** The signed-in user's active membership in this trip, or null while unknown. */
export function useMyMember(): TripMember | null {
  useTripSyncContext("useMyMember");
  const { data: session } = authClient.useSession();
  const { data: snapshot } = useTripSnapshot();
  const userId = session?.user.id;
  if (!userId || !snapshot) return null;
  return snapshot.members.find((m) => m.userId === userId && m.status === "active") ?? null;
}

export function useTripMutation(): {
  mutateAsync: <T extends MutationType>(
    type: T,
    payload: MutationPayload<T>,
  ) => Promise<MutationResponse>;
  isPending: boolean;
} {
  const { tripId, latestSeenVersion } = useTripSyncContext("useTripMutation");
  const queryClient = useQueryClient();
  const myMember = useMyMember();
  const snapshotKey = tripKeys.snapshot(tripId);

  const mutation = useMutation<MutationResponse, Error, Mutation>({
    onMutate: async (m) => {
      await queryClient.cancelQueries({ queryKey: snapshotKey });
      const memberId = myMember?.id;
      if (!memberId) return; // membership unknown — skip the optimistic apply
      const now = Date.now();
      queryClient.setQueryData<TripSnapshot>(snapshotKey, (old) =>
        old ? applyMutationOptimistic(old, m, { memberId, now }) : old,
      );
    },
    mutationFn: (m) => apiPost<MutationResponse>(`/api/trips/${tripId}/mutations`, m),
    onSuccess: (resp) => {
      // Reconcile through the same path as WS frames — including the gap
      // check, so a response that leapfrogs unseen events triggers a refetch
      // instead of advancing the watermark past them. The watermark dedupes
      // against the WS echo of this same event.
      recordSeenVersion(latestSeenVersion, resp.event.version);
      const refined = refineEntity(resp.event, resp.entity);
      if (!refined.ok) {
        queryClient.invalidateQueries({ queryKey: snapshotKey });
        return;
      }
      reconcileEvent(queryClient, tripId, resp.event, refined.entity);
    },
    onError: () => {
      // Authoritative refetch beats a naive rollback under concurrency — a
      // stored "previous" snapshot could clobber other members' changes.
      queryClient.invalidateQueries({ queryKey: snapshotKey });
    },
  });

  const { mutateAsync: rawMutateAsync } = mutation;
  const mutateAsync = useCallback(
    <T extends MutationType>(type: T, payload: MutationPayload<T>): Promise<MutationResponse> =>
      rawMutateAsync({ id: createId(), type, payload } as Mutation),
    [rawMutateAsync],
  );

  return { mutateAsync, isPending: mutation.isPending };
}

export function usePresence(): {
  members: PresenceState[];
  reportView: (view: PresenceView) => void;
} {
  const ctx = useTripSyncContext("usePresence");
  return { members: ctx.presenceMembers, reportView: ctx.sendPresence };
}

export function useConnectionStatus(): "connecting" | "open" | "closed" {
  return useTripSyncContext("useConnectionStatus").status;
}

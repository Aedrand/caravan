import type {
  EntityPostImage,
  FeedEvent,
  PresenceState,
  PresenceView,
  ServerWsMessage,
} from "@caravan/shared";
import type { WebSocketLike } from "@hono/node-server";
import type { WSContext } from "hono/ws";
import type { Logger } from "../logger";

/**
 * Trip rooms (M1.3, plan §3.3): in-memory fan-out for feed events and
 * presence. One room per trip, one entry per WS connection; presence is
 * ephemeral by design — nothing here touches the database.
 */

/** WebSocket OPEN ready state (WSReadyState 1). */
const WS_OPEN = 1;

/** Presence entries older than this are prunable — but only on dead connections. */
const PRESENCE_STALE_MS = 60_000;

/** Heartbeat cadence: ping every connection this often; one missed cycle (no
 *  pong) means the socket is half-open and gets terminated so it leaves the
 *  roster instead of lingering as a phantom presence. */
const HEARTBEAT_MS = 30_000;

/** The node `ws` socket behind a Hono WSContext (`WSContext.raw`), narrowed to
 *  just the liveness surface so we don't depend on the `ws` types directly.
 *  Absent in unit tests (fake WSContext) — every use is guarded. */
interface RawSocket {
  readyState: number;
  isAlive?: boolean;
  ping(): void;
  terminate(): void;
  on(event: "pong", listener: () => void): void;
}

/** A live connection as the room sees it. */
export interface TripRoomConn {
  /** Connection id (per socket, not per member — multiple tabs are normal). */
  id: string;
  memberId: string;
  name: string;
  ws: WSContext<WebSocketLike>;
}

interface ConnState extends TripRoomConn {
  /** Last reported view; null until the client sends its first presence message. */
  view: PresenceView | null;
  /** Last presence update (or join), epoch ms — server clock. */
  ts: number;
}

const emptyView = (): PresenceView => ({ date: null, activityId: null, editing: null });

const rawOf = (conn: ConnState): RawSocket | undefined =>
  conn.ws.raw as unknown as RawSocket | undefined;

export function createTripRooms(logger: Logger) {
  const rooms = new Map<string, Map<string, ConnState>>();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function send(tripId: string, conn: ConnState, message: string): void {
    try {
      if (conn.ws.readyState !== WS_OPEN) return;
      conn.ws.send(message);
    } catch (err) {
      logger.warn({ err, tripId, connId: conn.id }, "ws send failed");
    }
  }

  function broadcast(tripId: string, message: ServerWsMessage): void {
    const room = rooms.get(tripId);
    if (!room) return;
    const payload = JSON.stringify(message);
    for (const conn of room.values()) send(tripId, conn, payload);
  }

  function roster(tripId: string): PresenceState[] {
    const room = rooms.get(tripId);
    if (!room) return [];
    const now = Date.now();
    const byMember = new Map<string, ConnState>();
    for (const conn of room.values()) {
      // Prune stale entries ONLY when the socket is also dead — a live member
      // who simply hasn't moved in a while must never drop off the roster.
      if (now - conn.ts > PRESENCE_STALE_MS && conn.ws.readyState !== WS_OPEN) continue;
      const current = byMember.get(conn.memberId);
      // Multiple tabs: the most recently updated connection wins.
      if (!current || conn.ts > current.ts) byMember.set(conn.memberId, conn);
    }
    return [...byMember.values()].map((conn) => ({
      memberId: conn.memberId,
      name: conn.name,
      view: conn.view ?? emptyView(),
      ts: conn.ts,
    }));
  }

  function broadcastPresence(tripId: string): void {
    broadcast(tripId, { kind: "presence", members: roster(tripId) });
  }

  return {
    join(tripId: string, conn: TripRoomConn): void {
      let room = rooms.get(tripId);
      if (!room) {
        room = new Map();
        rooms.set(tripId, room);
      }
      room.set(conn.id, { ...conn, view: null, ts: Date.now() });
      // Mark live and reset liveness on every pong (browsers auto-pong pings).
      const raw = conn.ws.raw as unknown as RawSocket | undefined;
      if (raw && typeof raw.on === "function") {
        raw.isAlive = true;
        raw.on("pong", () => {
          raw.isAlive = true;
        });
      }
      broadcastPresence(tripId);
    },

    leave(tripId: string, connId: string): void {
      const room = rooms.get(tripId);
      if (!room) return;
      // onClose and onError can both fire for one socket — only the first matters.
      const removed = room.delete(connId);
      if (room.size === 0) {
        rooms.delete(tripId);
        return;
      }
      if (removed) broadcastPresence(tripId);
    },

    updatePresence(tripId: string, connId: string, view: PresenceView): void {
      const conn = rooms.get(tripId)?.get(connId);
      if (!conn) return;
      conn.view = view;
      conn.ts = Date.now();
      broadcastPresence(tripId);
    },

    /** Passed directly as ExecuteDeps.broadcast — fires after every committed mutation. */
    broadcastEvent(tripId: string, event: FeedEvent, entity: EntityPostImage | null): void {
      broadcast(tripId, { kind: "event", event, entity });
    },

    roster,

    /** Begin the ping/terminate sweep. Called once at server boot (not in
     *  tests). Idempotent. */
    startHeartbeat(intervalMs: number = HEARTBEAT_MS): void {
      if (heartbeat !== null) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        for (const room of rooms.values()) {
          for (const conn of room.values()) {
            const raw = rawOf(conn);
            if (!raw || raw.readyState !== WS_OPEN) continue;
            if (raw.isAlive === false) {
              // Missed the previous cycle — half-open. Terminate; onClose →
              // leave() drops it from the roster and rebroadcasts.
              try {
                raw.terminate();
              } catch (err) {
                logger.warn({ err, connId: conn.id }, "ws terminate failed");
              }
              continue;
            }
            raw.isAlive = false;
            try {
              raw.ping();
            } catch (err) {
              logger.warn({ err, connId: conn.id }, "ws ping failed");
            }
          }
        }
      }, intervalMs);
      // A pending heartbeat must not keep the process alive on its own.
      if (typeof heartbeat.unref === "function") heartbeat.unref();
    },

    shutdown(): void {
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      for (const [tripId, room] of rooms) {
        for (const conn of room.values()) {
          try {
            conn.ws.close(1001, "server shutting down");
          } catch (err) {
            logger.warn({ err, tripId, connId: conn.id }, "ws close failed");
          }
        }
      }
      rooms.clear();
    },
  };
}

export type TripRooms = ReturnType<typeof createTripRooms>;

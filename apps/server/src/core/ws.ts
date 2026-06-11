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

export function createTripRooms(logger: Logger) {
  const rooms = new Map<string, Map<string, ConnState>>();

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

    shutdown(): void {
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

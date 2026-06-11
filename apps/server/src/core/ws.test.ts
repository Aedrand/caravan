import {
  type Activity,
  createId,
  entityPostImageSchemas,
  type FeedEvent,
  firstPosition,
  ServerWsMessageSchema,
} from "@caravan/shared";
import type { WebSocketLike } from "@hono/node-server";
import type { WSContext } from "hono/ws";
import { afterEach, expect, test, vi } from "vitest";
import type { Logger } from "../logger";
import { createTripRooms } from "./ws";

afterEach(() => {
  vi.useRealTimers();
});

function makeLogger() {
  const warn = vi.fn();
  const logger = { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
  return { logger, warn };
}

interface FakeWs {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

function fakeWs(): FakeWs {
  // the real OPEN constant — Node 22's global WebSocket
  return { send: vi.fn(), close: vi.fn(), readyState: WebSocket.OPEN };
}

const asContext = (ws: FakeWs) => ws as unknown as WSContext<WebSocketLike>;

/** Every frame ever sent to this fake, parsed against the wire schema. */
function frames(ws: FakeWs) {
  return ws.send.mock.calls.map((call) =>
    ServerWsMessageSchema.parse(JSON.parse(call[0] as string)),
  );
}

function lastPresence(ws: FakeWs) {
  const frame = frames(ws).at(-1);
  if (frame?.kind !== "presence") throw new Error(`expected a presence frame, got ${frame?.kind}`);
  return frame;
}

test("join broadcasts the roster to the room; leave broadcasts the shrunk roster", () => {
  const rooms = createTripRooms(makeLogger().logger);
  const tripId = createId();
  const memberA = createId();
  const memberB = createId();
  const a = fakeWs();
  const b = fakeWs();

  rooms.join(tripId, { id: "conn-a", memberId: memberA, name: "Alice", ws: asContext(a) });
  expect(a.send).toHaveBeenCalledTimes(1);
  expect(lastPresence(a).members).toEqual([
    {
      memberId: memberA,
      name: "Alice",
      view: { date: null, activityId: null, editing: null },
      ts: expect.any(Number),
    },
  ]);

  rooms.join(tripId, { id: "conn-b", memberId: memberB, name: "Bob", ws: asContext(b) });
  expect(a.send).toHaveBeenCalledTimes(2);
  expect(b.send).toHaveBeenCalledTimes(1);
  expect(
    lastPresence(a)
      .members.map((m) => m.memberId)
      .sort(),
  ).toEqual([memberA, memberB].sort());

  rooms.leave(tripId, "conn-a");
  expect(b.send).toHaveBeenCalledTimes(2);
  expect(lastPresence(b).members.map((m) => m.memberId)).toEqual([memberB]);
  // the departed connection got nothing further
  expect(a.send).toHaveBeenCalledTimes(2);

  // double-leave (onClose after onError) is silent
  rooms.leave(tripId, "conn-a");
  expect(b.send).toHaveBeenCalledTimes(2);
});

test("roster dedupes by memberId — the latest-updated tab wins", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const rooms = createTripRooms(makeLogger().logger);
  const tripId = createId();
  const memberId = createId();
  const editing = createId();
  const tab1 = fakeWs();
  const tab2 = fakeWs();

  rooms.join(tripId, { id: "tab1", memberId, name: "Alice", ws: asContext(tab1) });
  vi.setSystemTime(2_000);
  rooms.join(tripId, { id: "tab2", memberId, name: "Alice", ws: asContext(tab2) });

  let roster = rooms.roster(tripId);
  expect(roster).toHaveLength(1);
  expect(roster[0]).toMatchObject({ memberId, ts: 2_000 });

  // tab1 reports a view later — its entry becomes the member's roster row
  vi.setSystemTime(3_000);
  rooms.updatePresence(tripId, "tab1", { date: "ideas", activityId: null, editing });
  roster = rooms.roster(tripId);
  expect(roster).toHaveLength(1);
  expect(roster[0]).toMatchObject({
    memberId,
    ts: 3_000,
    view: { date: "ideas", activityId: null, editing },
  });
});

test("roster prunes stale entries only when the socket is also dead", () => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  const rooms = createTripRooms(makeLogger().logger);
  const tripId = createId();
  const liveMember = createId();
  const deadMember = createId();
  const live = fakeWs();
  const dead = fakeWs();

  rooms.join(tripId, { id: "live", memberId: liveMember, name: "Alive", ws: asContext(live) });
  rooms.join(tripId, { id: "dead", memberId: deadMember, name: "Gone", ws: asContext(dead) });

  vi.setSystemTime(10_000 + 61_000);
  // both entries are stale, but only one socket is dead
  dead.readyState = WebSocket.CLOSED;

  const roster = rooms.roster(tripId);
  expect(roster.map((m) => m.memberId)).toEqual([liveMember]);
});

test("broadcastEvent sends a schema-valid event frame with the post-image", () => {
  const rooms = createTripRooms(makeLogger().logger);
  const tripId = createId();
  const conn = fakeWs();
  rooms.join(tripId, { id: "c1", memberId: createId(), name: "Alice", ws: asContext(conn) });

  const activity: Activity = {
    id: createId(),
    tripId,
    date: "2026-07-04",
    position: firstPosition(),
    title: "Sunrise hike",
    startTime: null,
    endTime: null,
    placeName: null,
    address: null,
    lat: null,
    lng: null,
    placeProvider: null,
    placeRef: null,
    category: "activity",
    notes: "",
    linkUrl: null,
    createdBy: createId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const event: FeedEvent = {
    id: createId(),
    tripId,
    version: 1,
    actorType: "user",
    actorMemberId: createId(),
    type: "activity.create",
    entityType: "activity",
    entityId: activity.id,
    payload: { title: activity.title, date: activity.date },
    createdAt: Date.now(),
  };

  rooms.broadcastEvent(tripId, event, activity);

  const frame = frames(conn).at(-1);
  expect(frame?.kind).toBe("event");
  if (frame?.kind !== "event") throw new Error("expected an event frame");
  expect(frame.event).toEqual(event);
  expect(entityPostImageSchemas.activity.parse(frame.entity)).toEqual(activity);
});

test("a failing send is logged, never thrown — and skips non-open sockets", () => {
  const { logger, warn } = makeLogger();
  const rooms = createTripRooms(logger);
  const tripId = createId();
  const broken = fakeWs();
  broken.send.mockImplementation(() => {
    throw new Error("boom");
  });
  const closed = fakeWs();
  closed.readyState = WebSocket.CLOSED;

  expect(() =>
    rooms.join(tripId, { id: "broken", memberId: createId(), name: "A", ws: asContext(broken) }),
  ).not.toThrow();
  expect(warn).toHaveBeenCalledTimes(1);

  rooms.join(tripId, { id: "closed", memberId: createId(), name: "B", ws: asContext(closed) });
  expect(closed.send).not.toHaveBeenCalled();
});

test("shutdown closes every connection with 1001 and clears all rooms", () => {
  const { logger, warn } = makeLogger();
  const rooms = createTripRooms(logger);
  const tripA = createId();
  const tripB = createId();
  const a = fakeWs();
  const b = fakeWs();
  b.close.mockImplementation(() => {
    throw new Error("already gone");
  });

  rooms.join(tripA, { id: "a", memberId: createId(), name: "A", ws: asContext(a) });
  rooms.join(tripB, { id: "b", memberId: createId(), name: "B", ws: asContext(b) });

  expect(() => rooms.shutdown()).not.toThrow();
  expect(a.close).toHaveBeenCalledExactlyOnceWith(1001, expect.any(String));
  expect(warn).toHaveBeenCalledTimes(1); // b's throwing close
  expect(rooms.roster(tripA)).toEqual([]);
  expect(rooms.roster(tripB)).toEqual([]);
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createId,
  entityPostImageSchemas,
  firstPosition,
  type ServerWsMessage,
  ServerWsMessageSchema,
  TripSnapshotSchema,
} from "@caravan/shared";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { afterEach, expect, test, vi } from "vitest";
import { WebSocketServer } from "ws";
import type { SessionUser } from "../auth/session";
import { createDb, schema } from "../db";
import { runMigrations } from "../db/migrate";
import "../features"; // registers mutation handlers
import type { Logger } from "../logger";
import { createSyncRoutes } from "./sync";
import { createTripRooms } from "./ws";

/**
 * Integration tests over a REAL http server + real WebSockets (Node 22's
 * global client), exercising the full upgrade path through Hono middleware —
 * the same wiring index.ts uses in production.
 */

const tempDirs: string[] = [];
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function withTimeout<T>(promise: Promise<T>, label: string, ms = 3_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function startHarness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-sync-"));
  tempDirs.push(dir);
  const { db, sqlite } = createDb(path.join(dir, "test.db"));
  runMigrations(db);
  // Track A tables aren't in the committed migrations yet (generated centrally
  // at integration); the snapshot endpoint reads them, so create them here.

  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
  const rooms = createTripRooms(logger);

  // Stub auth: the parent router normally applies requireUser; tests switch
  // identities by swapping `currentUser` between requests/upgrades.
  let currentUser: SessionUser = { id: "nobody", name: "Nobody", email: "n@x", role: "member" };
  const app = new Hono<{ Variables: { user: SessionUser } }>()
    .use("*", async (c, next) => {
      c.set("user", currentUser);
      await next();
    })
    .route("/", createSyncRoutes({ db, rooms, logger, upgradeWebSocket }));

  const wss = new WebSocketServer({ noServer: true });
  let server!: ReturnType<typeof serve>;
  const port = await new Promise<number>((resolve) => {
    server = serve(
      { fetch: app.fetch, port: 0, hostname: "127.0.0.1", websocket: { server: wss } },
      (info) => resolve(info.port),
    );
  });

  const sockets = new Set<WebSocket>();
  cleanups.push(async () => {
    for (const ws of sockets) {
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
    }
    rooms.shutdown();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      if ("closeAllConnections" in server) server.closeAllConnections();
    });
    sqlite.close();
  });

  const insertUser = (name: string): SessionUser => {
    const id = createId();
    const email = `${name.toLowerCase()}-${id.slice(0, 6)}@example.com`;
    db.insert(schema.user)
      .values({
        id,
        name,
        email,
        emailVerified: false,
        role: "member",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    return { id, name, email, role: "member" };
  };

  const addMember = (
    tripId: string,
    userId: string,
    role: "owner" | "editor" | "viewer",
    status: "active" | "ghost" = "active",
  ) => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.tripMembers)
      .values({ id, tripId, userId, role, status, joinedAt: now, updatedAt: now })
      .run();
    return id;
  };

  const insertTrip = (ownerUserId: string) => {
    const tripId = createId();
    const now = Date.now();
    db.insert(schema.trips)
      .values({
        id: tripId,
        name: "Test Trip",
        currency: "USD",
        createdBy: ownerUserId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const memberId = addMember(tripId, ownerUserId, "owner");
    return { tripId, memberId };
  };

  return {
    db,
    rooms,
    baseUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    setUser: (user: SessionUser) => {
      currentUser = user;
    },
    insertUser,
    insertTrip,
    addMember,
    trackSocket: (ws: WebSocket) => sockets.add(ws),
  };
}

type Harness = Awaited<ReturnType<typeof startHarness>>;

interface WsClient {
  ws: WebSocket;
  nextOfKind: <K extends ServerWsMessage["kind"]>(
    kind: K,
    pred?: (msg: Extract<ServerWsMessage, { kind: K }>) => boolean,
  ) => Promise<Extract<ServerWsMessage, { kind: K }>>;
}

/** Connect and buffer frames; consumers await matching frames — no sleeps. */
async function connect(h: Harness, tripId: string): Promise<WsClient> {
  const ws = new WebSocket(`${h.wsUrl}/${tripId}/ws`);
  h.trackSocket(ws);

  const buffer: ServerWsMessage[] = [];
  const waiters: Array<{
    pred: (msg: ServerWsMessage) => boolean;
    resolve: (msg: ServerWsMessage) => void;
  }> = [];

  ws.addEventListener("message", (evt) => {
    const msg = ServerWsMessageSchema.parse(JSON.parse(String(evt.data)));
    const index = waiters.findIndex((w) => w.pred(msg));
    if (index !== -1) {
      const waiter = waiters.splice(index, 1)[0];
      waiter?.resolve(msg);
      return;
    }
    buffer.push(msg);
  });

  const nextMatching = (pred: (msg: ServerWsMessage) => boolean, label: string) => {
    const index = buffer.findIndex(pred);
    if (index !== -1) {
      const msg = buffer.splice(index, 1)[0] as ServerWsMessage;
      return Promise.resolve(msg);
    }
    return withTimeout(
      new Promise<ServerWsMessage>((resolve) => waiters.push({ pred, resolve })),
      label,
    );
  };

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("close", () => reject(new Error("ws closed before open")), {
        once: true,
      });
    }),
    "ws open",
  );

  return {
    ws,
    nextOfKind: async <K extends ServerWsMessage["kind"]>(
      kind: K,
      pred?: (msg: Extract<ServerWsMessage, { kind: K }>) => boolean,
    ) => {
      const msg = await nextMatching(
        (m) => m.kind === kind && (!pred || pred(m as Extract<ServerWsMessage, { kind: K }>)),
        `"${kind}" frame`,
      );
      return msg as Extract<ServerWsMessage, { kind: K }>;
    },
  };
}

function activityCreateEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    id: createId(),
    type: "activity.create",
    payload: {
      activityId: createId(),
      title: "Sunrise hike",
      date: "2026-07-04",
      position: firstPosition(),
      ...overrides,
    },
  };
}

function postMutation(h: Harness, tripId: string, envelope: unknown) {
  return fetch(`${h.baseUrl}/${tripId}/mutations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
}

test("connect → hello carries the current trip version", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const { tripId } = h.insertTrip(alice.id);
  h.setUser(alice);

  const before = await connect(h, tripId);
  expect((await before.nextOfKind("hello")).version).toBe(0);

  const res = await postMutation(h, tripId, activityCreateEnvelope());
  expect(res.status).toBe(200);

  const after = await connect(h, tripId);
  expect((await after.nextOfKind("hello")).version).toBe(1);
});

test("a mutation over HTTP fans out an event frame to every room member", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const bob = h.insertUser("Bob");
  const { tripId } = h.insertTrip(alice.id);
  h.addMember(tripId, bob.id, "editor");

  h.setUser(alice);
  const a = await connect(h, tripId);
  await a.nextOfKind("hello");
  h.setUser(bob);
  const b = await connect(h, tripId);
  await b.nextOfKind("hello");

  const envelope = activityCreateEnvelope();
  const res = await postMutation(h, tripId, envelope);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { version: number; entity: unknown };
  expect(body.version).toBe(1);

  for (const client of [a, b]) {
    const frame = await client.nextOfKind("event");
    expect(frame.event.id).toBe(envelope.id);
    expect(frame.event.version).toBe(1);
    const entity = entityPostImageSchemas.activity.parse(frame.entity);
    expect(entity).toEqual(entityPostImageSchemas.activity.parse(body.entity));
    expect(entity.title).toBe("Sunrise hike");
  }
});

test("presence: views fan out to the room; closing drops you from the roster", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const bob = h.insertUser("Bob");
  const { tripId, memberId: aliceMemberId } = h.insertTrip(alice.id);
  h.addMember(tripId, bob.id, "editor");

  h.setUser(alice);
  const a = await connect(h, tripId);
  await a.nextOfKind("hello");
  h.setUser(bob);
  const b = await connect(h, tripId);
  await b.nextOfKind("hello");

  const editing = createId();
  a.ws.send(
    JSON.stringify({ kind: "presence", view: { date: "2026-07-04", activityId: null, editing } }),
  );
  const withView = await b.nextOfKind("presence", (msg) =>
    msg.members.some((m) => m.memberId === aliceMemberId && m.view.editing === editing),
  );
  const aliceState = withView.members.find((m) => m.memberId === aliceMemberId);
  expect(aliceState?.view).toEqual({ date: "2026-07-04", activityId: null, editing });
  expect(aliceState?.name).toBe("Alice");

  a.ws.close();
  const withoutAlice = await b.nextOfKind(
    "presence",
    (msg) => !msg.members.some((m) => m.memberId === aliceMemberId),
  );
  expect(withoutAlice.members.map((m) => m.name)).toEqual(["Bob"]);
});

test("non-members get 403 everywhere and unknown trips 404; the WS upgrade is rejected", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const mallory = h.insertUser("Mallory");
  const { tripId } = h.insertTrip(alice.id);

  h.setUser(mallory);
  const post = await postMutation(h, tripId, activityCreateEnvelope());
  expect(post.status).toBe(403);
  expect(((await post.json()) as { error: { code: string } }).error.code).toBe("not_a_member");

  const snapshot = await fetch(`${h.baseUrl}/${tripId}/snapshot`);
  expect(snapshot.status).toBe(403);

  // Undici surfaces a rejected upgrade as an "error" event (non-101 status).
  const outcome = await withTimeout(
    new Promise<string>((resolve) => {
      const ws = new WebSocket(`${h.wsUrl}/${tripId}/ws`);
      h.trackSocket(ws);
      ws.addEventListener("open", () => resolve("open"), { once: true });
      ws.addEventListener("error", () => resolve("rejected"), { once: true });
      ws.addEventListener("close", () => resolve("rejected"), { once: true });
    }),
    "ws rejection",
  );
  expect(outcome).toBe("rejected");

  h.setUser(alice);
  const missing = await fetch(`${h.baseUrl}/${createId()}/snapshot`);
  expect(missing.status).toBe(404);
  expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("trip_not_found");
});

test("snapshot includes ghosts and orders activities; events?since returns the ordered tail", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const ghost = h.insertUser("Casper");
  const { tripId } = h.insertTrip(alice.id);
  h.addMember(tripId, ghost.id, "editor", "ghost");
  h.setUser(alice);

  const versions: number[] = [];
  for (const title of ["First", "Second", "Third"]) {
    const res = await postMutation(h, tripId, activityCreateEnvelope({ title }));
    expect(res.status).toBe(200);
    versions.push(((await res.json()) as { version: number }).version);
  }
  expect(versions).toEqual([1, 2, 3]);

  const snapshot = (await (await fetch(`${h.baseUrl}/${tripId}/snapshot`)).json()) as {
    trip: { version: number };
    members: Array<{ name: string; status: string }>;
    activities: Array<{ position: string; id: string }>;
  };
  expect(snapshot.trip.version).toBe(3);
  expect(snapshot.members.map((m) => m.status).sort()).toEqual(["active", "ghost"]);
  const sorted = [...snapshot.activities].sort(
    (x, y) => x.position.localeCompare(y.position) || x.id.localeCompare(y.id),
  );
  expect(snapshot.activities).toEqual(sorted);

  const tail = (await (await fetch(`${h.baseUrl}/${tripId}/events?since=0`)).json()) as {
    events: Array<{ version: number }>;
  };
  expect(tail.events.map((e) => e.version)).toEqual([1, 2, 3]);

  const empty = (await (await fetch(`${h.baseUrl}/${tripId}/events?since=3`)).json()) as {
    events: unknown[];
  };
  expect(empty.events).toEqual([]);

  for (const query of ["", "?since=abc", "?since=-1"]) {
    const bad = await fetch(`${h.baseUrl}/${tripId}/events${query}`);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("invalid_since");
  }
});

test("snapshot carries Trip Workspace v2 days + idea lists and parses with the schema", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const { tripId } = h.insertTrip(alice.id);
  h.setUser(alice);

  // A day with a subtitle (D2) and a named idea list (D10).
  const day = await postMutation(h, tripId, {
    id: createId(),
    type: "day.upsert",
    payload: { dayId: createId(), date: "2026-07-04", subtitle: "Arrival" },
  });
  expect(day.status).toBe(200);
  const listId = createId();
  const list = await postMutation(h, tripId, {
    id: createId(),
    type: "ideaList.create",
    payload: { listId, name: "Food", position: firstPosition() },
  });
  expect(list.status).toBe(200);

  // An idea assigned to the list rides in `activities` with its listId set.
  const ideaCreate = await postMutation(
    h,
    tripId,
    activityCreateEnvelope({ title: "Ramen", date: null, listId }),
  );
  expect(ideaCreate.status).toBe(200);

  const raw = await (await fetch(`${h.baseUrl}/${tripId}/snapshot`)).json();
  const snapshot = TripSnapshotSchema.parse(raw); // the contract holds end-to-end
  expect(snapshot.days).toHaveLength(1);
  expect(snapshot.days[0]).toMatchObject({ date: "2026-07-04", subtitle: "Arrival" });
  expect(snapshot.ideaLists).toHaveLength(1);
  expect(snapshot.ideaLists[0]).toMatchObject({ name: "Food", id: listId });
  expect(snapshot.activities.find((a) => a.title === "Ramen")?.listId).toBe(listId);
});

test("idempotent replay: same envelope twice → same version, one feed row, entity both times", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const { tripId } = h.insertTrip(alice.id);
  h.setUser(alice);

  const envelope = activityCreateEnvelope();
  const first = await postMutation(h, tripId, envelope);
  const replay = await postMutation(h, tripId, envelope);
  expect(first.status).toBe(200);
  expect(replay.status).toBe(200);

  const a = (await first.json()) as { version: number; entity: { id: string } | null };
  const b = (await replay.json()) as { version: number; entity: { id: string } | null };
  expect(a.version).toBe(1);
  expect(b.version).toBe(1);
  const activityId = (envelope.payload as { activityId: string }).activityId;
  expect(a.entity?.id).toBe(activityId);
  expect(b.entity?.id).toBe(activityId);

  expect(h.db.select().from(schema.feedEvents).all()).toHaveLength(1);
  expect(h.db.select().from(schema.activities).all()).toHaveLength(1);
});

test("malformed bodies: invalid JSON and invalid mutations are 400s with envelopes", async () => {
  const h = await startHarness();
  const alice = h.insertUser("Alice");
  const { tripId } = h.insertTrip(alice.id);
  h.setUser(alice);

  const notJson = await fetch(`${h.baseUrl}/${tripId}/mutations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{nope",
  });
  expect(notJson.status).toBe(400);
  expect(((await notJson.json()) as { error: { code: string } }).error.code).toBe("invalid_json");

  const badMutation = await postMutation(h, tripId, { id: createId(), type: "activity.create" });
  expect(badMutation.status).toBe(400);
  expect(((await badMutation.json()) as { error: { code: string } }).error.code).toBe(
    "invalid_mutation",
  );
});

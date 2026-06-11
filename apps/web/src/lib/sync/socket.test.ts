import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PresenceView, ServerWsMessage } from "./shared";
import { type ConnectionStatus, TripSocket } from "./socket";

/**
 * Minimal scripted WebSocket double: the test drives the server side via the
 * server*() helpers. Cast through `typeof WebSocket` because TripSocket only
 * touches the constructor + onopen/onmessage/onclose/onerror/readyState/
 * send/close subset, which the fake implements.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static reset(): void {
    FakeWebSocket.instances = [];
  }

  url: string;
  readyState = 0; // CONNECTING
  sent: string[] = [];
  closeCalls = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3; // CLOSED
  }

  serverOpen(): void {
    this.readyState = 1; // OPEN
    this.onopen?.({});
  }

  serverClose(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  serverError(): void {
    this.onerror?.({});
  }

  serverMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

const FakeImpl = FakeWebSocket as unknown as typeof WebSocket;

function latest(): FakeWebSocket {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error("no FakeWebSocket instance yet");
  return ws;
}

function makeSocket() {
  const messages: ServerWsMessage[] = [];
  const statuses: ConnectionStatus[] = [];
  const socket = new TripSocket({
    tripId: "trip-1",
    url: "ws://test.local/api/trips/trip-1/ws",
    WebSocketImpl: FakeImpl,
    onMessage: (msg) => messages.push(msg),
    onStatus: (s) => statuses.push(s),
  });
  return { socket, messages, statuses };
}

const view = (editing: string | null = null): PresenceView => ({
  date: null,
  activityId: null,
  editing,
});

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TripSocket", () => {
  it("reports the status sequence across connect, open, drop, reconnect", () => {
    const { socket, statuses } = makeSocket();
    socket.connect();
    expect(statuses).toEqual(["connecting"]);

    latest().serverOpen();
    expect(statuses).toEqual(["connecting", "open"]);

    latest().serverClose();
    expect(statuses).toEqual(["connecting", "open", "closed"]);

    // First retry: 300ms base + ≤30% jitter ⇒ fires within 390ms.
    vi.advanceTimersByTime(391);
    expect(statuses).toEqual(["connecting", "open", "closed", "connecting"]);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("grows the reconnect backoff exponentially and caps it at 5s (+jitter)", () => {
    const { socket } = makeSocket();
    socket.connect();

    // attempt n ⇒ delay ∈ [base, 1.3 * base), base = min(300 * 2^n, 5000)
    const bases = [300, 600, 1200, 2400, 4800, 5000, 5000];
    for (const base of bases) {
      const count = FakeWebSocket.instances.length;
      latest().serverClose();

      vi.advanceTimersByTime(base - 1); // before the un-jittered minimum: nothing
      expect(FakeWebSocket.instances).toHaveLength(count);

      vi.advanceTimersByTime(Math.ceil(base * 0.3) + 2); // past base * 1.3: retried
      expect(FakeWebSocket.instances).toHaveLength(count + 1);
    }
  });

  it("resets the attempt counter after a successful open", () => {
    const { socket } = makeSocket();
    socket.connect();

    latest().serverClose(); // attempt 0 → ~300ms
    vi.advanceTimersByTime(391);
    latest().serverClose(); // attempt 1 → ~600ms
    vi.advanceTimersByTime(781);
    expect(FakeWebSocket.instances).toHaveLength(3);

    latest().serverOpen(); // success — counter resets
    latest().serverClose();

    vi.advanceTimersByTime(299); // back to the first-attempt window
    expect(FakeWebSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(92);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it("treats errors like drops and reconnects", () => {
    const { socket, statuses } = makeSocket();
    socket.connect();
    latest().serverOpen();

    latest().serverError();
    expect(statuses.at(-1)).toBe("closed");

    vi.advanceTimersByTime(391);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("close() closes the socket and never reconnects", () => {
    const { socket, statuses } = makeSocket();
    socket.connect();
    latest().serverOpen();

    socket.close();
    expect(latest().closeCalls).toBe(1);
    expect(statuses.at(-1)).toBe("closed");

    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("close() cancels an already-scheduled reconnect", () => {
    const { socket } = makeSocket();
    socket.connect();
    latest().serverClose(); // schedules a retry

    socket.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("throttles presence to one trailing-edge send per window, latest view wins", () => {
    const { socket } = makeSocket();
    socket.connect();
    latest().serverOpen();

    socket.sendPresence(view("a".repeat(32)));
    socket.sendPresence(view("b".repeat(32)));
    socket.sendPresence(view(null));
    expect(latest().sent).toEqual([]); // trailing edge: nothing yet

    vi.advanceTimersByTime(150);
    expect(latest().sent).toHaveLength(1);
    expect(JSON.parse(latest().sent[0] ?? "")).toEqual({ kind: "presence", view: view(null) });

    socket.sendPresence(view("c".repeat(32)));
    vi.advanceTimersByTime(149);
    expect(latest().sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(latest().sent).toHaveLength(2);
    expect(JSON.parse(latest().sent[1] ?? "")).toEqual({
      kind: "presence",
      view: view("c".repeat(32)),
    });
  });

  it("drops presence while the socket is not open", () => {
    const { socket } = makeSocket();
    socket.connect(); // connecting, never opened
    socket.sendPresence(view());
    vi.advanceTimersByTime(150);
    expect(latest().sent).toEqual([]);
  });

  it("ignores invalid frames without throwing and delivers valid ones", () => {
    const { socket, messages } = makeSocket();
    socket.connect();
    latest().serverOpen();

    expect(() => {
      latest().serverMessage("not json{");
      latest().serverMessage(JSON.stringify({ kind: "mystery" }));
      latest().serverMessage(JSON.stringify({ kind: "hello" })); // missing version
      latest().serverMessage(JSON.stringify(null));
    }).not.toThrow();
    expect(messages).toEqual([]);

    latest().serverMessage(JSON.stringify({ kind: "hello", version: 7 }));
    expect(messages).toEqual([{ kind: "hello", version: 7 }]);
  });

  it("derives the default URL from location lazily, at connect time", () => {
    // Constructing without a url must not touch `location` (absent in Node).
    const socket = new TripSocket({
      tripId: "trip-9",
      WebSocketImpl: FakeImpl,
      onMessage: () => {},
      onStatus: () => {},
    });

    vi.stubGlobal("location", { protocol: "https:", host: "app.example.com" });
    socket.connect();
    expect(latest().url).toBe("wss://app.example.com/api/trips/trip-9/ws");
    socket.close();
  });
});

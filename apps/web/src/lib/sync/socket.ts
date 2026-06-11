import {
  type ClientWsMessage,
  type PresenceView,
  type ServerWsMessage,
  ServerWsMessageSchema,
} from "./shared";

/**
 * Trip WebSocket with reconnect + presence throttling (plan §3.4). No React:
 * the provider owns one instance per mounted trip; tests drive it with a fake
 * WebSocketImpl and fake timers.
 */

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface TripSocketOptions {
  tripId: string;
  onMessage: (msg: ServerWsMessage) => void;
  onStatus: (s: ConnectionStatus) => void;
  /** Injectable for tests; defaults to the global WebSocket. */
  WebSocketImpl?: typeof WebSocket;
  /** Endpoint override; defaults to same-origin `/api/trips/:id/ws`. */
  url?: string;
}

const BASE_RECONNECT_MS = 300;
const MAX_RECONNECT_MS = 5000;
const RECONNECT_JITTER = 0.3;
const PRESENCE_THROTTLE_MS = 150;
/** WebSocket.OPEN, inlined so injected fakes don't need the static. */
const WS_OPEN = 1;

export class TripSocket {
  private readonly opts: TripSocketOptions;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "closed";
  /** Consecutive failed (re)connects since the last successful open. */
  private attempt = 0;
  /** True after close() — an intentional shutdown that must not reconnect. */
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingView: PresenceView | null = null;

  constructor(opts: TripSocketOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.ws) return;
    this.closed = false;
    this.openSocket();
  }

  /** Throttled (trailing edge): at most one frame per window, latest view wins. */
  sendPresence(view: PresenceView): void {
    this.pendingView = view;
    if (this.presenceTimer !== null) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      this.flushPresence();
    }, PRESENCE_THROTTLE_MS);
  }

  /** Intentional shutdown: clears timers, never reconnects. */
  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.presenceTimer !== null) {
      clearTimeout(this.presenceTimer);
      this.presenceTimer = null;
    }
    this.pendingView = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      detach(ws);
      ws.close();
    }
    this.setStatus("closed");
  }

  private openSocket(): void {
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    this.setStatus("connecting");
    const ws = new Impl(this.resolveUrl());
    this.ws = ws;

    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.attempt = 0;
      this.setStatus("open");
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      let raw: unknown;
      try {
        raw = JSON.parse(String(e.data));
      } catch {
        return; // not JSON — ignore
      }
      const parsed = ServerWsMessageSchema.safeParse(raw);
      if (!parsed.success) return; // unknown frame — ignore
      this.opts.onMessage(parsed.data);
    };
    ws.onclose = () => this.handleDrop(ws);
    ws.onerror = () => this.handleDrop(ws);
  }

  /** Unexpected close/error: report it and schedule a reconnect with backoff. */
  private handleDrop(ws: WebSocket): void {
    if (ws !== this.ws) return;
    this.ws = null;
    detach(ws);
    try {
      ws.close();
    } catch {
      // already closing/closed
    }
    this.setStatus("closed");
    if (this.closed || this.reconnectTimer !== null) return;

    // 300ms * 2^attempt, capped at 5s, plus up to 30% jitter to avoid
    // thundering herds when a server restart drops every client at once.
    const base = Math.min(BASE_RECONNECT_MS * 2 ** this.attempt, MAX_RECONNECT_MS);
    const delay = base + Math.random() * RECONNECT_JITTER * base;
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.openSocket();
    }, delay);
  }

  private flushPresence(): void {
    const view = this.pendingView;
    this.pendingView = null;
    if (!view || !this.ws || this.ws.readyState !== WS_OPEN) return;
    const msg: ClientWsMessage = { kind: "presence", view };
    this.ws.send(JSON.stringify(msg));
  }

  private setStatus(next: ConnectionStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.opts.onStatus(next);
  }

  /** Computed lazily — `location` only exists in the browser, and tests run in Node. */
  private resolveUrl(): string {
    if (this.opts.url) return this.opts.url;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/api/trips/${this.opts.tripId}/ws`;
  }
}

function detach(ws: WebSocket): void {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
}

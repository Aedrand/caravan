import { getConnInfo } from "@hono/node-server/conninfo";
import type { MiddlewareHandler } from "hono";

/**
 * In-memory fixed-window rate limiter (D.6). Single process by design (TD-2),
 * so a Map of counters is sufficient — no Redis. The core `FixedWindowLimiter`
 * is pure-ish (clock injectable) and unit-testable; `rateLimit()` wires it into
 * Hono and derives the client key. Keep the limits generous (see config
 * defaults) so normal use and the Playwright M1 gate never trip them.
 */

export interface RateLimitDecision {
  /** True when the request is within the window's allowance. */
  allowed: boolean;
  /** Requests still permitted in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the current window resets — fed to the Retry-After header. */
  retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Counts requests per key in fixed time windows. When a key's window has
 * elapsed it resets to a fresh count, so memory is bounded by active keys and
 * stale entries are reclaimed lazily on next access (and by `prune()`).
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Record one hit for `key` and report whether it is allowed. */
  hit(key: string): RateLimitDecision {
    const t = this.now();
    let state = this.windows.get(key);
    if (!state || t >= state.resetAt) {
      state = { count: 0, resetAt: t + this.windowMs };
      this.windows.set(key, state);
    }
    state.count += 1;
    const allowed = state.count <= this.limit;
    return {
      allowed,
      remaining: Math.max(0, this.limit - state.count),
      retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - t) / 1000)),
    };
  }

  /** Drop windows that have already reset; call periodically if long-lived. */
  prune(): void {
    const t = this.now();
    for (const [key, state] of this.windows) {
      if (t >= state.resetAt) this.windows.delete(key);
    }
  }
}

/**
 * Best-effort client key. By default we key by the socket remote address only:
 * a bare-port client controls `x-forwarded-for`, so trusting it unconditionally
 * lets anyone spoof a fresh key and bypass the limit. Only when `trustProxy` is
 * true (set when Caravan runs behind a trusted reverse proxy) do we honour the
 * first `x-forwarded-for` hop. An authenticated user id is folded in when present
 * so a signed-in user isn't penalised for sharing a NAT'd IP.
 */
export function clientKey(c: Parameters<MiddlewareHandler>[0], trustProxy = false): string {
  let ip: string | undefined;
  if (trustProxy) {
    ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  }
  if (!ip) {
    try {
      ip = getConnInfo(c).remote.address;
    } catch {
      ip = undefined;
    }
  }
  const base = ip || "unknown";
  const userId = (c.get("user") as { id?: string } | undefined)?.id;
  return userId ? `${base}|${userId}` : base;
}

/** A rate-limit middleware that also exposes its limiter so callers can prune it. */
export interface RateLimitMiddleware extends MiddlewareHandler {
  /** The underlying limiter — register a periodic `prune()` to bound memory. */
  limiter: FixedWindowLimiter;
}

/**
 * Build a Hono middleware enforcing `limit` requests per `windowMs` per client.
 * `enabled: false` makes it a no-op (used in NODE_ENV=test so the suite and the
 * Playwright M1 gate, which fire many requests from one IP, are never limited).
 * The returned function carries its `limiter` so a job can periodically prune it.
 */
export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  enabled?: boolean;
  trustProxy?: boolean;
  now?: () => number;
}): RateLimitMiddleware {
  const enabled = opts.enabled ?? true;
  const trustProxy = opts.trustProxy ?? false;
  const limiter = new FixedWindowLimiter(opts.limit, opts.windowMs, opts.now);

  const middleware: MiddlewareHandler = async (c, next) => {
    if (!enabled) return next();
    const decision = limiter.hit(clientKey(c, trustProxy));
    if (!decision.allowed) {
      c.header("Retry-After", String(decision.retryAfterSeconds));
      return c.json(
        {
          error: {
            code: "rate_limited",
            message: "Too many requests — please slow down and try again shortly.",
          },
        },
        429,
      );
    }
    return next();
  };

  return Object.assign(middleware, { limiter });
}

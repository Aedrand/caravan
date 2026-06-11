/**
 * Minimal typed fetch wrapper for the JSON API. The server reports failures
 * as `{ error: { code, message } }` envelopes with a 4xx/5xx status (TD-1);
 * apiFetch turns those into ApiError throws so callers can branch on `code`
 * without re-parsing bodies.
 */

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);

  if (!res.ok) {
    let code = "http_error";
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ErrorEnvelope;
      if (typeof body?.error?.code === "string") code = body.error.code;
      if (typeof body?.error?.message === "string") message = body.error.message;
    } catch {
      // Non-JSON error body — keep the fallbacks.
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

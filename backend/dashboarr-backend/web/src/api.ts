import type { Overview, UiSession } from "../../src/ui/overview-types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/**
 * API paths are resolved relative to the page URL, never to the host root, so
 * the same bundle works at https://host/ and behind a reverse-proxy prefix
 * such as https://host/dashboarr/ (the proxy strips the prefix; the cookie the
 * server sets has no explicit Path and therefore lands on the same prefix).
 * The page must be opened with a trailing slash for that resolution to hold.
 */
function apiUrl(path: string): string {
  return new URL(path, document.baseURI).toString();
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!res.ok) {
    let code = "error";
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string") code = body.error;
    } catch {
      // non-JSON error body (e.g. the rate limiter's), keep the generic code
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

export function getSession(): Promise<UiSession> {
  return call<UiSession>("ui/api/session");
}

export function login(password: string): Promise<void> {
  return call<{ ok: true }>("ui/api/login", { method: "POST", body: JSON.stringify({ password }) }).then(() => undefined);
}

export function logout(): Promise<void> {
  return call<{ ok: true }>("ui/api/logout", { method: "POST" }).then(() => undefined);
}

export function getOverview(signal?: AbortSignal): Promise<Overview> {
  return call<Overview>("ui/api/overview", { signal });
}

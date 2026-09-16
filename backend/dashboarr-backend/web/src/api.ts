import type { Overview, OverviewBackup, UiSession } from "../../src/ui/overview-types";
import { WEB_SLOT_ID } from "../../src/ui/overview-types";
import type { EncryptedEnvelope } from "./lib/envelope";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/** 409 from a web-slot write: `current` is the slot as it is now (null = deleted). */
export class ConflictError extends ApiError {
  constructor(public readonly current: OverviewBackup | null) {
    super(409, "conflict");
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
    let current: OverviewBackup | null | undefined;
    try {
      const body = (await res.json()) as { error?: string; current?: OverviewBackup | null };
      if (typeof body.error === "string") code = body.error;
      current = body.current;
    } catch {
      // non-JSON error body (e.g. the rate limiter's), keep the generic code
    }
    if (res.status === 409 && current !== undefined) throw new ConflictError(current);
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

// --- Config editor (Refs #385) ---

export interface BackupEnvelopeResponse extends OverviewBackup {
  envelope: EncryptedEnvelope;
}

export function getBackupEnvelope(id: string): Promise<BackupEnvelopeResponse> {
  return call<BackupEnvelopeResponse>(`ui/api/backups/${encodeURIComponent(id)}/envelope`);
}

export interface WebBackupPutBody {
  envelope: EncryptedEnvelope;
  configVersion: number;
  exportedAt: number;
  expectedRevision: number | null;
}

export interface WebBackupPutResult {
  ok: true;
  updatedAt: number;
  sizeBytes: number;
  revision: number;
}

export function putWebBackup(body: WebBackupPutBody): Promise<WebBackupPutResult> {
  return call<WebBackupPutResult>(`ui/api/backups/${WEB_SLOT_ID}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteWebBackup(expectedRevision?: number): Promise<void> {
  return call<{ ok: true }>(`ui/api/backups/${WEB_SLOT_ID}`, {
    method: "DELETE",
    body: JSON.stringify(expectedRevision === undefined ? {} : { expectedRevision }),
  }).then(() => undefined);
}

/** Human copy for the errors the editor surfaces. */
export function describeApiError(err: unknown): string {
  if (err instanceof ConflictError) return "The backup changed on the backend since you opened it.";
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return "Your session expired. Sign in again.";
      case 403:
        return err.code === "cross_origin" ? "The backend rejected the request as cross-origin." : "The web UI is disabled.";
      case 413:
        return "The backup is larger than the backend accepts (4 MB).";
      case 429:
        return "Too many saves. Wait a minute and try again.";
      default:
        return `The backend answered ${err.status} (${err.code}).`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

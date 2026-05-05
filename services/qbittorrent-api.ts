import { Platform } from "react-native";
import { buildUrl } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { getSecret, setSecret, deleteSecret } from "@/store/storage";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";
import type {
  QBTransferInfo,
  QBTorrent,
  QBTorrentFile,
  QBTorrentTracker,
  QBSpeedPreferences,
} from "@/lib/types";

// Session cookie management. Kept in a closure (not a module-level `let`) so
// it isn't trivially enumerable from outside this file, and persisted in
// SecureStore (Keychain / Keystore) so we don't need to re-authenticate on
// every cold start.
const SESSION_COOKIE_KEY = "secrets.qbittorrent.sessionCookie";

// iOS's NSURLSession strips Set-Cookie from response.headers — the cookie
// lives in the native jar and we can't read the SID from JS. Android's OkHttp
// CookieJar usually also consumes Set-Cookie before fetch exposes it, so we
// fall back to the same sentinel approach when we can't parse the SID.
const NATIVE_JAR_SENTINEL = "__native_cookie_jar__";

const cookieStore = (() => {
  let cached: string | null = null;
  let loaded = false;
  let loginPromise: Promise<boolean> | null = null;

  return {
    async get(): Promise<string | null> {
      if (!loaded) {
        cached = await getSecret(SESSION_COOKIE_KEY);
        loaded = true;
      }
      return cached;
    },
    async set(value: string | null): Promise<void> {
      cached = value;
      loaded = true;
      if (value) await setSecret(SESSION_COOKIE_KEY, value);
      else await deleteSecret(SESSION_COOKIE_KEY);
    },
    /** Dedup concurrent login attempts so we only hit /auth/login once. */
    getLoginPromise() {
      return loginPromise;
    },
    setLoginPromise(p: Promise<boolean> | null) {
      loginPromise = p;
    },
  };
})();

/**
 * Authenticate with qBittorrent using username/password.
 * Must be called before any other qBittorrent API call.
 */
export async function qbLogin(): Promise<boolean> {
  const store = useConfigStore.getState();
  const secrets = store.secrets.qbittorrent;
  const baseUrl = store.getActiveUrl("qbittorrent");
  const apiBase = SERVICE_DEFAULTS.qbittorrent.apiBasePath;

  const response = await fetch(buildUrl(baseUrl, apiBase, "/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(secrets.username ?? "")}&password=${encodeURIComponent(secrets.password ?? "")}`,
  });

  if (!response.ok) return false;

  const text = await response.text();
  if (text !== "Ok.") return false;

  // Try to extract the SID so we can attach it as a Cookie header. If we
  // can't read Set-Cookie (iOS always strips it; Android usually does because
  // OkHttp's CookieJar consumes it), the platform jar still has the cookie
  // and will auto-attach it on subsequent requests — record a sentinel so
  // ensureAuth() knows we've authenticated.
  if (Platform.OS !== "ios") {
    const setCookie = response.headers.get("set-cookie");
    const match = setCookie?.match(/SID=([^;]+)/);
    if (match?.[1]) {
      await cookieStore.set(match[1]);
      return true;
    }
  }
  await cookieStore.set(NATIVE_JAR_SENTINEL);
  return true;
}

/**
 * Ensure we have an active session before making requests.
 * Deduplicates concurrent login attempts.
 */
async function ensureAuth(): Promise<void> {
  if (await cookieStore.get()) return;
  const existing = cookieStore.getLoginPromise();
  if (existing) {
    await existing;
    return;
  }
  const p = qbLogin();
  cookieStore.setLoginPromise(p);
  try {
    const ok = await p;
    if (!ok) throw new Error("qBittorrent authentication failed");
  } finally {
    cookieStore.setLoginPromise(null);
  }
}

async function parseQbResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

function applyCookie(headers: Headers, cookie: string | null): void {
  headers.delete("Cookie");
  if (cookie && cookie !== NATIVE_JAR_SENTINEL) {
    headers.set("Cookie", `SID=${cookie}`);
  }
}

async function qbRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoResponse("qbittorrent", path) ?? undefined) as T;
  }

  if (!store.services.qbittorrent.enabled) {
    throw new Error("qBittorrent is not enabled");
  }
  const baseUrl = store.getActiveUrl("qbittorrent");
  if (!baseUrl) throw new Error("No URL configured for qBittorrent");
  const apiBase = SERVICE_DEFAULTS.qbittorrent.apiBasePath;

  // Auto-login on first request
  await ensureAuth();

  const headers = new Headers(options?.headers);
  applyCookie(headers, await cookieStore.get());

  const response = await fetch(buildUrl(baseUrl, apiBase, path), {
    ...options,
    headers,
  });

  // Re-authenticate if session expired
  if (response.status === 403) {
    await cookieStore.set(null);
    await ensureAuth();
    applyCookie(headers, await cookieStore.get());
    const retry = await fetch(buildUrl(baseUrl, apiBase, path), {
      ...options,
      headers,
    });
    if (!retry.ok) throw new Error(`qBittorrent request failed: ${retry.status}`);
    return parseQbResponse<T>(retry);
  }

  if (!response.ok) throw new Error(`qBittorrent request failed: ${response.status}`);
  return parseQbResponse<T>(response);
}

/**
 * Clear the stored qBittorrent session cookie. Call on sign-out or after the
 * user changes their qBittorrent password so we don't try to reuse a
 * now-invalid session.
 */
export async function qbClearSession(): Promise<void> {
  await cookieStore.set(null);
}

// --- Transfer Info ---

export function getTransferInfo(): Promise<QBTransferInfo> {
  return qbRequest<QBTransferInfo>("/transfer/info");
}

// --- Torrents ---

// Mirrors the query params accepted by `GET /api/v2/torrents/info`. `sort` is
// any field name from `QBTorrent` (e.g. "progress", "added_on", "dlspeed").
// `hashes` are joined with `|` per the qBT 5.0 API.
export type QBTorrentFilter =
  | "all"
  | "downloading"
  | "seeding"
  | "completed"
  | "paused"
  | "active"
  | "inactive"
  | "stalled"
  | "errored";

export interface GetTorrentsOptions {
  filter?: QBTorrentFilter;
  category?: string;
  tag?: string;
  sort?: keyof QBTorrent;
  reverse?: boolean;
  limit?: number;
  offset?: number;
  hashes?: string[];
}

export function getTorrents(options: GetTorrentsOptions = {}): Promise<QBTorrent[]> {
  const params = new URLSearchParams();
  if (options.filter) params.set("filter", options.filter);
  if (options.category !== undefined) params.set("category", options.category);
  if (options.tag !== undefined) params.set("tag", options.tag);
  if (options.sort) params.set("sort", options.sort);
  if (options.reverse !== undefined) params.set("reverse", String(options.reverse));
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  if (options.hashes && options.hashes.length > 0) {
    params.set("hashes", options.hashes.join("|"));
  }
  const query = params.toString();
  return qbRequest<QBTorrent[]>(`/torrents/info${query ? `?${query}` : ""}`);
}

export function getTorrentFiles(hash: string): Promise<QBTorrentFile[]> {
  return qbRequest<QBTorrentFile[]>(`/torrents/files?hash=${hash}`);
}

export function getTorrentTrackers(hash: string): Promise<QBTorrentTracker[]> {
  return qbRequest<QBTorrentTracker[]>(`/torrents/trackers?hash=${hash}`);
}

// --- Torrent Actions ---

// qBittorrent 5.0 renamed /torrents/pause → /torrents/stop and
// /torrents/resume → /torrents/start. Try the new path first and fall back
// to the legacy path on 404 so we work against both 4.x and 5.x servers.
async function qbActionWithFallback(
  primary: string,
  legacy: string,
  body: string,
): Promise<void> {
  try {
    await qbRequest(primary, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    if (err instanceof Error && err.message.endsWith(": 404")) {
      await qbRequest(legacy, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      return;
    }
    throw err;
  }
}

export function pauseTorrents(hashes: string[]): Promise<void> {
  return qbActionWithFallback(
    "/torrents/stop",
    "/torrents/pause",
    `hashes=${hashes.join("|")}`,
  );
}

export function resumeTorrents(hashes: string[]): Promise<void> {
  return qbActionWithFallback(
    "/torrents/start",
    "/torrents/resume",
    `hashes=${hashes.join("|")}`,
  );
}

export function deleteTorrents(
  hashes: string[],
  deleteFiles = false,
): Promise<void> {
  return qbRequest("/torrents/delete", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `hashes=${hashes.join("|")}&deleteFiles=${deleteFiles}`,
  });
}

export function addTorrentMagnet(magnetUri: string): Promise<void> {
  return qbRequest("/torrents/add", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `urls=${encodeURIComponent(magnetUri)}`,
  });
}

// --- Speed Limits ---

// /transfer/setDownloadLimit and /setUploadLimit take bytes/s. 0 = unlimited.
export function setDownloadLimit(bytesPerSec: number): Promise<void> {
  return qbRequest("/transfer/setDownloadLimit", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `limit=${Math.max(0, Math.round(bytesPerSec))}`,
  });
}

export function setUploadLimit(bytesPerSec: number): Promise<void> {
  return qbRequest("/transfer/setUploadLimit", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `limit=${Math.max(0, Math.round(bytesPerSec))}`,
  });
}

// --- Alternative Speed Mode ---

// /transfer/speedLimitsMode returns "0" (off) or "1" (on) as plain text.
export async function getSpeedLimitsMode(): Promise<boolean> {
  const raw = await qbRequest<string>("/transfer/speedLimitsMode");
  return String(raw).trim() === "1";
}

export function toggleSpeedLimitsMode(): Promise<void> {
  return qbRequest("/transfer/toggleSpeedLimitsMode", { method: "POST" });
}

// /app/preferences exposes alt_dl_limit / alt_up_limit (and global dl_limit /
// up_limit) in bytes/s. 0 = unlimited. The wiki claims KiB/s but the real API
// returns bytes — verified against a running instance (9216 == "9 KiB/s" in
// the desktop UI).
export async function getSpeedPreferences(): Promise<QBSpeedPreferences> {
  const prefs = await qbRequest<Record<string, unknown>>("/app/preferences");
  const num = (key: string) => {
    const v = prefs[key];
    return typeof v === "number" && v > 0 ? v : 0;
  };
  return {
    dl_limit: num("dl_limit"),
    up_limit: num("up_limit"),
    alt_dl_limit: num("alt_dl_limit"),
    alt_up_limit: num("alt_up_limit"),
  };
}

// Set alt limits via /app/setPreferences. Values are bytes/s; 0 = unlimited.
export function setAltSpeedLimits(limits: {
  dl?: number;
  up?: number;
}): Promise<void> {
  const sanitized: Record<string, number> = {};
  if (limits.dl !== undefined) {
    sanitized.alt_dl_limit = Math.max(0, Math.round(limits.dl));
  }
  if (limits.up !== undefined) {
    sanitized.alt_up_limit = Math.max(0, Math.round(limits.up));
  }
  return qbRequest("/app/setPreferences", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `json=${encodeURIComponent(JSON.stringify(sanitized))}`,
  });
}

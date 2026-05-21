import { Platform } from "react-native";
import { buildUrl } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { getSecret, setSecret, deleteSecret } from "@/store/storage";
import { SERVICE_DEFAULTS, SECRET_PREFIX } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";
import type {
  QBTransferInfo,
  QBTorrent,
  QBTorrentFile,
  QBTorrentTracker,
  QBSpeedPreferences,
} from "@/lib/types";

// iOS's NSURLSession strips Set-Cookie from response.headers — the cookie
// lives in the native jar and we can't read the SID from JS. Android's OkHttp
// CookieJar usually also consumes Set-Cookie before fetch exposes it, so we
// fall back to the same sentinel approach when we can't parse the SID.
const NATIVE_JAR_SENTINEL = "__native_cookie_jar__";

interface CookieEntry {
  cached: string | null;
  loaded: boolean;
  loginPromise: Promise<boolean> | null;
}

// One CookieEntry per qBittorrent instance UUID, so two simultaneously-
// configured qBits keep separate session state. Persisted to SecureStore under
// `secrets.${instanceId}.sessionCookie`.
const cookieStores = new Map<string, CookieEntry>();

function sessionKeyFor(instanceId: string): string {
  return `${SECRET_PREFIX}.${instanceId}.sessionCookie`;
}

function getEntry(instanceId: string): CookieEntry {
  let entry = cookieStores.get(instanceId);
  if (!entry) {
    entry = { cached: null, loaded: false, loginPromise: null };
    cookieStores.set(instanceId, entry);
  }
  return entry;
}

async function getCookie(instanceId: string): Promise<string | null> {
  const entry = getEntry(instanceId);
  if (!entry.loaded) {
    entry.cached = await getSecret(sessionKeyFor(instanceId));
    entry.loaded = true;
  }
  return entry.cached;
}

async function setCookie(instanceId: string, value: string | null): Promise<void> {
  const entry = getEntry(instanceId);
  entry.cached = value;
  entry.loaded = true;
  if (value) await setSecret(sessionKeyFor(instanceId), value);
  else await deleteSecret(sessionKeyFor(instanceId));
}

// Resolve which qBittorrent instance to talk to. The hooks layer (step 3) will
// thread instanceId explicitly; until then, callers default to the active
// qBittorrent picked by the user (or the first instance if none is active).
function resolveQbInstanceId(instanceId?: string): string {
  if (instanceId) return instanceId;
  const id = useConfigStore.getState().getActiveInstanceId("qbittorrent");
  if (!id) throw new Error("No qBittorrent instance configured");
  return id;
}

/**
 * Authenticate with qBittorrent using username/password.
 * Must be called before any other qBittorrent API call.
 */
export async function qbLogin(instanceId?: string): Promise<boolean> {
  const id = resolveQbInstanceId(instanceId);
  const store = useConfigStore.getState();
  const secrets = store.instanceSecrets[id] ?? {};
  const baseUrl = store.getActiveUrl("qbittorrent", id);
  const apiBase = SERVICE_DEFAULTS.qbittorrent.apiBasePath;

  // Custom headers first so the reverse proxy lets /auth/login through; then
  // the form Content-Type wins. We deliberately ignore a user-supplied
  // `Cookie` so the platform jar can populate SID on the response.
  const headers = new Headers();
  const customHeaders = store.getMergedHeaders("qbittorrent", id);
  for (const [k, v] of Object.entries(customHeaders)) {
    if (k.toLowerCase() === "cookie") continue;
    headers.set(k, v);
  }
  headers.set("Content-Type", "application/x-www-form-urlencoded");

  const response = await fetch(buildUrl(baseUrl, apiBase, "/auth/login"), {
    method: "POST",
    headers,
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
    const setCookieHeader = response.headers.get("set-cookie");
    const match = setCookieHeader?.match(/SID=([^;]+)/);
    if (match?.[1]) {
      await setCookie(id, match[1]);
      return true;
    }
  }
  await setCookie(id, NATIVE_JAR_SENTINEL);
  return true;
}

/**
 * Ensure we have an active session before making requests.
 * Deduplicates concurrent login attempts.
 */
async function ensureAuth(instanceId: string): Promise<void> {
  if (await getCookie(instanceId)) return;
  const entry = getEntry(instanceId);
  if (entry.loginPromise) {
    // Waiters must propagate the leader's outcome — otherwise a failed login
    // returns void to the waiter, which then sends an unauth'd request and
    // surfaces an opaque 403 (or worse, silently recovers via the retry path
    // while the *leader* shows "auth failed" — see #87).
    const ok = await entry.loginPromise;
    if (!ok) throw new Error("qBittorrent authentication failed");
    return;
  }
  // Single retry with brief backoff: qBittorrent 5.x can transiently return a
  // non-Ok login response under concurrent first-time auth (e.g. cold boot
  // race when several widgets mount at once). qBT's default anti-bruteforce
  // is 5 failed auths/min, so one retry is well under the threshold.
  const p = (async (): Promise<boolean> => {
    if (await qbLogin(instanceId)) return true;
    await new Promise((r) => setTimeout(r, 200));
    return qbLogin(instanceId);
  })();
  entry.loginPromise = p;
  try {
    const ok = await p;
    if (!ok) throw new Error("qBittorrent authentication failed");
  } finally {
    entry.loginPromise = null;
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

async function qbRequest<T>(
  path: string,
  options?: RequestInit,
  instanceId?: string,
): Promise<T> {
  const id = resolveQbInstanceId(instanceId);
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoResponse("qbittorrent", path) ?? undefined) as T;
  }

  const inst = store.getInstance("qbittorrent", id);
  if (!inst?.enabled) {
    throw new Error("qBittorrent is not enabled");
  }
  const baseUrl = store.getActiveUrl("qbittorrent", id);
  if (!baseUrl) throw new Error("No URL configured for qBittorrent");
  const apiBase = SERVICE_DEFAULTS.qbittorrent.apiBasePath;

  // Auto-login on first request
  await ensureAuth(id);

  const headers = new Headers(options?.headers);

  // Apply custom headers FIRST. We skip `Cookie` so the user can't accidentally
  // clobber the SID; applyCookie() then sets/replaces the Cookie header itself.
  const customHeaders = store.getMergedHeaders("qbittorrent", id);
  for (const [k, v] of Object.entries(customHeaders)) {
    if (k.toLowerCase() === "cookie") continue;
    headers.set(k, v);
  }

  applyCookie(headers, await getCookie(id));

  const response = await fetch(buildUrl(baseUrl, apiBase, path), {
    ...options,
    headers,
  });

  // Re-authenticate if session expired
  if (response.status === 403) {
    await setCookie(id, null);
    await ensureAuth(id);
    applyCookie(headers, await getCookie(id));
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
 * now-invalid session. With no `instanceId`, clears every cached instance —
 * useful when the user has just rotated credentials and wants a clean slate.
 */
export async function qbClearSession(instanceId?: string): Promise<void> {
  if (instanceId) {
    await setCookie(instanceId, null);
    return;
  }
  // Clear every known instance's cache + storage.
  const store = useConfigStore.getState();
  const ids = (store.serviceInstances.qbittorrent ?? []).map((i) => i.id);
  // Include any cookieStores keys we might have for instances not currently in
  // the store (e.g. after a deletion that didn't clean up).
  for (const id of cookieStores.keys()) ids.push(id);
  for (const id of new Set(ids)) {
    await setCookie(id, null);
  }
}

// --- Transfer Info ---

export function getTransferInfo(instanceId?: string): Promise<QBTransferInfo> {
  return qbRequest<QBTransferInfo>("/transfer/info", undefined, instanceId);
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

export function getTorrents(
  options: GetTorrentsOptions = {},
  instanceId?: string,
): Promise<QBTorrent[]> {
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
  return qbRequest<QBTorrent[]>(
    `/torrents/info${query ? `?${query}` : ""}`,
    undefined,
    instanceId,
  );
}

export function getTorrentFiles(
  hash: string,
  instanceId?: string,
): Promise<QBTorrentFile[]> {
  return qbRequest<QBTorrentFile[]>(`/torrents/files?hash=${hash}`, undefined, instanceId);
}

export function getTorrentTrackers(
  hash: string,
  instanceId?: string,
): Promise<QBTorrentTracker[]> {
  return qbRequest<QBTorrentTracker[]>(
    `/torrents/trackers?hash=${hash}`,
    undefined,
    instanceId,
  );
}

// --- Torrent Actions ---

// qBittorrent 5.0 renamed /torrents/pause → /torrents/stop and
// /torrents/resume → /torrents/start. Try the new path first and fall back
// to the legacy path on 404 so we work against both 4.x and 5.x servers.
async function qbActionWithFallback(
  primary: string,
  legacy: string,
  body: string,
  instanceId?: string,
): Promise<void> {
  try {
    await qbRequest(
      primary,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
      instanceId,
    );
  } catch (err) {
    if (err instanceof Error && err.message.endsWith(": 404")) {
      await qbRequest(
        legacy,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
        instanceId,
      );
      return;
    }
    throw err;
  }
}

export function pauseTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  return qbActionWithFallback(
    "/torrents/stop",
    "/torrents/pause",
    `hashes=${hashes.join("|")}`,
    instanceId,
  );
}

export function resumeTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  return qbActionWithFallback(
    "/torrents/start",
    "/torrents/resume",
    `hashes=${hashes.join("|")}`,
    instanceId,
  );
}

export function deleteTorrents(
  hashes: string[],
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  return qbRequest(
    "/torrents/delete",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `hashes=${hashes.join("|")}&deleteFiles=${deleteFiles}`,
    },
    instanceId,
  );
}

export function addTorrentMagnet(
  magnetUri: string,
  instanceId?: string,
): Promise<void> {
  return qbRequest(
    "/torrents/add",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `urls=${encodeURIComponent(magnetUri)}`,
    },
    instanceId,
  );
}

// --- Speed Limits ---

// /transfer/setDownloadLimit and /setUploadLimit take bytes/s. 0 = unlimited.
export function setDownloadLimit(
  bytesPerSec: number,
  instanceId?: string,
): Promise<void> {
  return qbRequest(
    "/transfer/setDownloadLimit",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `limit=${Math.max(0, Math.round(bytesPerSec))}`,
    },
    instanceId,
  );
}

export function setUploadLimit(
  bytesPerSec: number,
  instanceId?: string,
): Promise<void> {
  return qbRequest(
    "/transfer/setUploadLimit",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `limit=${Math.max(0, Math.round(bytesPerSec))}`,
    },
    instanceId,
  );
}

// --- Alternative Speed Mode ---

// /transfer/speedLimitsMode returns "0" (off) or "1" (on) as plain text.
export async function getSpeedLimitsMode(instanceId?: string): Promise<boolean> {
  const raw = await qbRequest<string>("/transfer/speedLimitsMode", undefined, instanceId);
  return String(raw).trim() === "1";
}

export function toggleSpeedLimitsMode(instanceId?: string): Promise<void> {
  return qbRequest(
    "/transfer/toggleSpeedLimitsMode",
    { method: "POST" },
    instanceId,
  );
}

// /app/preferences exposes alt_dl_limit / alt_up_limit (and global dl_limit /
// up_limit) in bytes/s. 0 = unlimited. The wiki claims KiB/s but the real API
// returns bytes — verified against a running instance (9216 == "9 KiB/s" in
// the desktop UI).
export async function getSpeedPreferences(
  instanceId?: string,
): Promise<QBSpeedPreferences> {
  const prefs = await qbRequest<Record<string, unknown>>(
    "/app/preferences",
    undefined,
    instanceId,
  );
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
export function setAltSpeedLimits(
  limits: { dl?: number; up?: number },
  instanceId?: string,
): Promise<void> {
  const sanitized: Record<string, number> = {};
  if (limits.dl !== undefined) {
    sanitized.alt_dl_limit = Math.max(0, Math.round(limits.dl));
  }
  if (limits.up !== undefined) {
    sanitized.alt_up_limit = Math.max(0, Math.round(limits.up));
  }
  return qbRequest(
    "/app/setPreferences",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `json=${encodeURIComponent(JSON.stringify(sanitized))}`,
    },
    instanceId,
  );
}

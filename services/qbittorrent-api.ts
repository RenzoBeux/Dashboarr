import { serviceRequest } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { getSecret, setSecret, deleteSecret } from "@/store/storage";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type {
  QBTransferInfo,
  QBTorrent,
  QBTorrentFile,
  QBTorrentTracker,
} from "@/lib/types";

// Session cookie management. Kept in a closure (not a module-level `let`) so
// it isn't trivially enumerable from outside this file, and persisted in
// SecureStore (Keychain / Keystore) so we don't need to re-authenticate on
// every cold start.
const SESSION_COOKIE_KEY = "secrets.qbittorrent.sessionCookie";

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

  const response = await fetch(`${baseUrl}${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(secrets.username ?? "")}&password=${encodeURIComponent(secrets.password ?? "")}`,
  });

  if (!response.ok) return false;

  const text = await response.text();
  if (text !== "Ok.") return false;

  // Extract SID cookie
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/SID=([^;]+)/);
    if (match) await cookieStore.set(match[1] ?? null);
  }

  return (await cookieStore.get()) !== null;
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

async function qbRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const store = useConfigStore.getState();
  const baseUrl = store.getActiveUrl("qbittorrent");
  const apiBase = SERVICE_DEFAULTS.qbittorrent.apiBasePath;

  // Auto-login on first request
  await ensureAuth();

  let cookie = await cookieStore.get();
  const headers = new Headers(options?.headers);
  headers.set("Cookie", `SID=${cookie}`);

  const response = await fetch(`${baseUrl}${apiBase}${path}`, {
    ...options,
    headers,
  });

  // Re-authenticate if session expired
  if (response.status === 403) {
    await cookieStore.set(null);
    await ensureAuth();
    cookie = await cookieStore.get();
    headers.set("Cookie", `SID=${cookie}`);
    const retry = await fetch(`${baseUrl}${apiBase}${path}`, {
      ...options,
      headers,
    });
    if (!retry.ok) throw new Error(`qBittorrent request failed: ${retry.status}`);
    return (await retry.json()) as T;
  }

  if (!response.ok) throw new Error(`qBittorrent request failed: ${response.status}`);

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
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

export function getTorrents(
  filter?: "all" | "downloading" | "seeding" | "completed" | "paused" | "active" | "inactive" | "stalled",
): Promise<QBTorrent[]> {
  const params = filter ? `?filter=${filter}` : "";
  return qbRequest<QBTorrent[]>(`/torrents/info${params}`);
}

export function getTorrentFiles(hash: string): Promise<QBTorrentFile[]> {
  return qbRequest<QBTorrentFile[]>(`/torrents/files?hash=${hash}`);
}

export function getTorrentTrackers(hash: string): Promise<QBTorrentTracker[]> {
  return qbRequest<QBTorrentTracker[]>(`/torrents/trackers?hash=${hash}`);
}

// --- Torrent Actions ---

export function pauseTorrents(hashes: string[]): Promise<void> {
  return qbRequest("/torrents/pause", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `hashes=${hashes.join("|")}`,
  });
}

export function resumeTorrents(hashes: string[]): Promise<void> {
  return qbRequest("/torrents/resume", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `hashes=${hashes.join("|")}`,
  });
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

export function setDownloadLimit(limit: number): Promise<void> {
  return qbRequest("/transfer/setDownloadLimit", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `limit=${limit}`,
  });
}

export function setUploadLimit(limit: number): Promise<void> {
  return qbRequest("/transfer/setUploadLimit", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `limit=${limit}`,
  });
}

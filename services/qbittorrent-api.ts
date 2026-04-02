import { serviceRequest } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type {
  QBTransferInfo,
  QBTorrent,
  QBTorrentFile,
  QBTorrentTracker,
} from "@/lib/types";

let sessionCookie: string | null = null;
let loginPromise: Promise<boolean> | null = null;

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
    if (match) sessionCookie = match[1];
  }

  return true;
}

/**
 * Ensure we have an active session before making requests.
 * Deduplicates concurrent login attempts.
 */
async function ensureAuth(): Promise<void> {
  if (sessionCookie) return;
  if (loginPromise) {
    await loginPromise;
    return;
  }
  loginPromise = qbLogin();
  try {
    const ok = await loginPromise;
    if (!ok) throw new Error("qBittorrent authentication failed");
  } finally {
    loginPromise = null;
  }
}

async function qbRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const store = useConfigStore.getState();
  const baseUrl = store.getActiveUrl("qbittorrent");
  const apiBase = SERVICE_DEFAULTS.qbittorrent.apiBasePath;

  // Auto-login on first request
  await ensureAuth();

  const headers = new Headers(options?.headers);
  headers.set("Cookie", `SID=${sessionCookie}`);

  const response = await fetch(`${baseUrl}${apiBase}${path}`, {
    ...options,
    headers,
  });

  // Re-authenticate if session expired
  if (response.status === 403) {
    sessionCookie = null;
    await ensureAuth();
    headers.set("Cookie", `SID=${sessionCookie}`);
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

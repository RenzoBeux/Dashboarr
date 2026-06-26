import type { StoredServiceConfig } from "../db/repos/config.js";
import { SERVICE_API_BASE } from "../types.js";
import { activeBaseUrl } from "./http.js";

// qBittorrent 5.0 renamed `pausedUP`/`pausedDL` to `stoppedUP`/`stoppedDL`.
export type TorrentState =
  | "error"
  | "missingFiles"
  | "uploading"
  | "pausedUP"
  | "stoppedUP"
  | "queuedUP"
  | "stalledUP"
  | "checkingUP"
  | "forcedUP"
  | "allocating"
  | "downloading"
  | "metaDL"
  | "pausedDL"
  | "stoppedDL"
  | "queuedDL"
  | "stalledDL"
  | "checkingDL"
  | "forcedDL"
  | "checkingResumeData"
  | "moving"
  | "unknown";

export interface QBTorrent {
  hash: string;
  name: string;
  state: TorrentState;
  category: string;
}

// Simple in-process session cookie cache keyed by `<baseUrl>`.
const sessionCookies = new Map<string, { cookie: string; expiresAt: number }>();
const COOKIE_TTL_MS = 30 * 60 * 1000;

function cookieKey(config: StoredServiceConfig): string {
  return `${activeBaseUrl(config)}|${config.username ?? ""}`;
}

async function login(config: StoredServiceConfig): Promise<string> {
  const base = activeBaseUrl(config);
  if (!base) throw new Error("qBittorrent URL not configured");
  const apiBase = SERVICE_API_BASE.qbittorrent;

  const res = await fetch(`${base}${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(config.username ?? "")}&password=${encodeURIComponent(config.password ?? "")}`,
  });

  if (!res.ok) throw new Error(`qBittorrent login HTTP ${res.status}`);
  const text = (await res.text()).trim();
  // Older qBittorrent versions return HTTP 200 with "Ok."
  // Newer versions may return HTTP 204 No Content.
  if (res.status !== 204 && text !== "" && text !== "Ok.") {
    throw new Error(`qBittorrent login rejected: ${text || "<empty response>"}`);
  }

  const setCookie = res.headers.get("set-cookie") ?? "";
  // Accept any session cookie name (SID, QBT_SID, QBT_SID_8080, ...)
  const match = setCookie.match(/^([^=]+=[^;]+)/);
  if (!match) {
    throw new Error("qBittorrent login missing session cookie");
  }
  return match[1];
}

async function ensureCookie(config: StoredServiceConfig): Promise<string> {
  const key = cookieKey(config);
  const cached = sessionCookies.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.cookie;
  const cookie = await login(config);
  sessionCookies.set(key, { cookie, expiresAt: Date.now() + COOKIE_TTL_MS });
  return cookie;
}

async function qbFetch<T>(config: StoredServiceConfig, path: string): Promise<T> {
  const base = activeBaseUrl(config);
  const apiBase = SERVICE_API_BASE.qbittorrent;
  const url = `${base}${apiBase}${path}`;
  let cookie = await ensureCookie(config);

const doFetch = (cookie: string) =>
    fetch(url, {headers: { Cookie: cookie,},});

  let res = await doFetch(cookie);
  if (res.status === 403) {
    sessionCookies.delete(cookieKey(config));
    cookie = await ensureCookie(config);
    res = await doFetch(cookie);
  }
  if (!res.ok) throw new Error(`qBittorrent ${path} HTTP ${res.status}`);

  const ct = res.headers.get("content-type");
  if (ct?.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export function getQbTorrents(config: StoredServiceConfig): Promise<QBTorrent[]> {
  return qbFetch<QBTorrent[]>(config, "/torrents/info");
}

export function clearQbSession(config: StoredServiceConfig): void {
  sessionCookies.delete(cookieKey(config));
}

import type { StoredServiceConfig } from "../db/repos/config.js";
import { SERVICE_API_BASE } from "../types.js";
import { activeBaseUrl } from "./http.js";

export type TorrentState =
  | "error"
  | "missingFiles"
  | "uploading"
  | "pausedUP"
  | "queuedUP"
  | "stalledUP"
  | "checkingUP"
  | "forcedUP"
  | "allocating"
  | "downloading"
  | "metaDL"
  | "pausedDL"
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
  const text = await res.text();
  if (text !== "Ok.") throw new Error("qBittorrent login rejected");

  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/SID=([^;]+)/);
  if (!match || !match[1]) throw new Error("qBittorrent login missing SID cookie");
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

  const doFetch = (c: string) =>
    fetch(url, { headers: { Cookie: `SID=${c}` } });

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

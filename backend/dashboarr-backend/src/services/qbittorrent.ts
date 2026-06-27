import type { StoredServiceConfig } from "../db/repos/config.js";
import { SERVICE_API_BASE } from "../types.js";
import { activeBaseUrl, buildUrl } from "./http.js";

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

// Simple in-process session cookie cache keyed by `<baseUrl>|<username>`. The
// cached value is the verbatim `name=value` cookie to resend, or the sentinel
// below when the server authenticates this client without a cookie.
const sessionCookies = new Map<string, { cookie: string; expiresAt: number }>();
const COOKIE_TTL_MS = 30 * 60 * 1000;

// Login succeeded but qBittorrent issued no session cookie. This happens when
// the server bypasses auth for the client ("Bypass authentication for clients
// on localhost / in whitelisted subnets"); qbFetch then sends no Cookie header.
const AUTH_BYPASS_SENTINEL = "__qbt_no_cookie__";

function cookieKey(config: StoredServiceConfig): string {
  return `${activeBaseUrl(config)}|${config.username ?? ""}`;
}

/**
 * Pick qBittorrent's session cookie out of a Set-Cookie list and return the
 * verbatim `name=value` token (everything up to the first `;`) so it can be
 * resent unchanged. qBittorrent 5.2.0+ names the cookie `QBT_SID_<webui_port>`
 * (e.g. `QBT_SID_8080`); older builds used `SID`. Matching by those names
 * ignores any cookies a reverse proxy may have injected (JSESSIONID, XSRF-TOKEN,
 * ...) and is independent of header order. Returns null when none is present.
 */
export function extractSessionCookie(setCookieList: string[]): string | null {
  for (const raw of setCookieList) {
    const pair = (raw.split(";", 1)[0] ?? "").trim();
    const name = (pair.split("=", 1)[0] ?? "").trim();
    if (name === "SID" || name.startsWith("QBT_SID_")) return pair;
  }
  return null;
}

/**
 * Decide, from a 2xx `/auth/login` response, whether we're authenticated and
 * what to cache: the `name=value` cookie to resend, or AUTH_BYPASS_SENTINEL when
 * login succeeded without a cookie. `body` is "" for a 204 (No Content).
 */
export function interpretLoginResponse(
  status: number,
  body: string,
  setCookieList: string[],
): { kind: "ok"; cookie: string } | { kind: "rejected" } {
  // A rejected login replies 200 "Fails.".
  if (body.trim() === "Fails.") return { kind: "rejected" };

  const cookie = extractSessionCookie(setCookieList);
  // Success signals: 204 No Content (5.2.0+), 200 "Ok." (older builds), or a
  // session cookie regardless of body (the cookie is authoritative). Anything
  // else (e.g. an auth-proxy HTML login page) is treated as a rejection.
  const success = status === 204 || body.trim() === "Ok." || cookie !== null;
  if (!success) return { kind: "rejected" };

  return { kind: "ok", cookie: cookie ?? AUTH_BYPASS_SENTINEL };
}

async function login(config: StoredServiceConfig): Promise<string> {
  const base = activeBaseUrl(config);
  if (!base) throw new Error("qBittorrent URL not configured");
  const apiBase = SERVICE_API_BASE.qbittorrent;

  const res = await fetch(buildUrl(base, apiBase, "/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(config.username ?? "")}&password=${encodeURIComponent(config.password ?? "")}`,
  });

  // A 403 here is qBittorrent's brute-force ban ("Your IP is banned..."); let it
  // surface as an HTTP error rather than a generic "rejected".
  if (!res.ok) throw new Error(`qBittorrent login HTTP ${res.status}`);

  const body = res.status === 204 ? "" : await res.text();
  const result = interpretLoginResponse(res.status, body, res.headers.getSetCookie());
  if (result.kind === "rejected") throw new Error("qBittorrent login rejected");
  return result.cookie;
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
  const url = buildUrl(base, apiBase, path);
  let cookie = await ensureCookie(config);

  // Resend whatever name=value cookie qBittorrent issued (SID, or QBT_SID_<port>
  // on 5.2.0+). The sentinel means the server authenticates by IP — send none.
  const doFetch = (c: string) =>
    fetch(url, c === AUTH_BYPASS_SENTINEL ? {} : { headers: { Cookie: c } });

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

import { Platform } from "react-native";
import { buildUrl } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { getSecret, setSecret, deleteSecret } from "@/store/storage";
import { SERVICE_DEFAULTS, SECRET_PREFIX } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";
import type {
  AdguardServerStatus,
  AdguardProtectionRequest,
  AdguardStats,
  AdguardQueryLogResponse,
  AdguardQueryLogFilters,
  AdguardQueryLogConfig,
  AdguardFilterStatus,
  AdguardRewriteEntry,
  AdguardVersionInfo,
  AdguardDnsConfig,
} from "@/lib/types";

// iOS's NSURLSession strips Set-Cookie from response.headers — the cookie
// lives in the native jar and we can't read agh_session from JS. Android's
// OkHttp CookieJar usually also consumes Set-Cookie before fetch exposes it,
// so we fall back to the same sentinel approach when we can't parse it.
// Mirrors services/qbittorrent-api.ts, the closest existing analog (login
// endpoint + cookie session, not a header token like Pi-hole's X-FTL-SID).
const NATIVE_JAR_SENTINEL = "__native_cookie_jar__";

const SESSION_COOKIE_NAME = "agh_session";

interface CookieEntry {
  cached: string | null;
  loaded: boolean;
  loginPromise: Promise<boolean> | null;
}

// One CookieEntry per AdGuard Home instance UUID. Persisted to SecureStore
// under `secrets.${instanceId}.sessionCookie`.
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

function resolveAdguardInstanceId(instanceId?: string): string {
  if (instanceId) return instanceId;
  const id = useConfigStore.getState().getActiveInstanceId("adguard");
  if (!id) throw new Error("No AdGuard Home instance configured");
  return id;
}

/**
 * Thrown on a 429 from /control/login so callers can tell "the login rate
 * limiter has kicked in" apart from "wrong username or password" (a 403) —
 * conflating the two would send a user to reset a working password.
 */
export class AdguardRateLimitedError extends Error {
  constructor(public retryAfterSeconds: number | null) {
    super(
      retryAfterSeconds
        ? `AdGuard Home is temporarily blocking login attempts — try again in ${retryAfterSeconds}s`
        : "AdGuard Home is temporarily blocking login attempts — try again shortly",
    );
    this.name = "AdguardRateLimitedError";
  }
}

/**
 * Authenticate with AdGuard Home using username/password. Must be called
 * before any other AdGuard Home API call, UNLESS the instance is running
 * "userless" (no users configured server-side) — see ensureAuth below.
 */
export async function adguardLogin(instanceId?: string): Promise<boolean> {
  const id = resolveAdguardInstanceId(instanceId);
  const store = useConfigStore.getState();
  const secrets = store.instanceSecrets[id] ?? {};
  const baseUrl = store.getActiveUrl("adguard", id);
  const apiBase = SERVICE_DEFAULTS.adguard.apiBasePath;

  const headers = new Headers();
  const customHeaders = store.getMergedHeaders("adguard", id);
  for (const [k, v] of Object.entries(customHeaders)) {
    if (k.toLowerCase() === "cookie") continue;
    headers.set(k, v);
  }
  headers.set("Content-Type", "application/json");

  const response = await fetch(buildUrl(baseUrl, apiBase, "/login"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: secrets.username ?? "",
      password: secrets.password ?? "",
    }),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new AdguardRateLimitedError(retryAfter ? Number(retryAfter) || null : null);
  }
  if (!response.ok) return false;

  // Set-Cookie isn't readable on iOS (and usually not on Android either — see
  // NATIVE_JAR_SENTINEL above), so fall back to trusting the platform jar.
  if (Platform.OS !== "ios") {
    const setCookieHeader = response.headers.get("set-cookie");
    const match = setCookieHeader?.match(
      new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
    );
    if (match?.[1]) {
      await setCookie(id, match[1]);
      return true;
    }
  }
  await setCookie(id, NATIVE_JAR_SENTINEL);
  return true;
}

/**
 * Ensure we have an active session before making requests. Deduplicates
 * concurrent login attempts.
 *
 * Unlike qBittorrent's version, this does NOT retry a failed login: AGH's
 * authRateLimiter locks out the caller's IP+username after a small number of
 * failures (internal/home/authratelimiter.go), and a blind retry on a
 * genuinely wrong password would burn into that budget for no benefit.
 *
 * When the instance has no username/password configured at all, this is a
 * deliberate "userless" instance (AGH's own auth middleware is bypassed
 * entirely when zero users exist server-side — internal/home/auth.go) rather
 * than an unconfigured one, so we skip login and let every request go out
 * with no Cookie header.
 */
async function ensureAuth(instanceId: string): Promise<void> {
  const store = useConfigStore.getState();
  const secrets = store.instanceSecrets[instanceId] ?? {};
  if (!secrets.username && !secrets.password) return;

  if (await getCookie(instanceId)) return;
  const entry = getEntry(instanceId);
  if (entry.loginPromise) {
    const ok = await entry.loginPromise;
    if (!ok) throw new Error("AdGuard Home authentication failed");
    return;
  }
  const p = adguardLogin(instanceId);
  entry.loginPromise = p;
  try {
    const ok = await p;
    if (!ok) throw new Error("AdGuard Home authentication failed");
  } finally {
    entry.loginPromise = null;
  }
}

// Carries the HTTP status alongside the message so callers can branch on it.
// AGH's control endpoints answer errors as PLAIN TEXT (http.Error), not a JSON
// envelope like Pi-hole's — the raw body IS the message.
export class AdguardHttpError extends Error {
  constructor(
    public status: number,
    bodyText?: string,
  ) {
    super(bodyText?.trim() || `AdGuard Home request failed: ${status}`);
    this.name = "AdguardHttpError";
  }
}

async function parseAdguardResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

function applyCookie(headers: Headers, cookie: string | null): void {
  headers.delete("Cookie");
  if (cookie && cookie !== NATIVE_JAR_SENTINEL) {
    headers.set("Cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  }
}

async function adguardRequest<T>(
  path: string,
  options?: RequestInit,
  instanceId?: string,
): Promise<T> {
  const id = resolveAdguardInstanceId(instanceId);
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoResponse("adguard", path) ?? undefined) as T;
  }

  const inst = store.getInstance("adguard", id);
  if (!inst?.enabled) {
    throw new Error("AdGuard Home is not enabled");
  }
  const baseUrl = store.getActiveUrl("adguard", id);
  if (!baseUrl) throw new Error("No URL configured for AdGuard Home");
  const apiBase = SERVICE_DEFAULTS.adguard.apiBasePath;

  await ensureAuth(id);

  const headers = new Headers(options?.headers);
  const customHeaders = store.getMergedHeaders("adguard", id);
  for (const [k, v] of Object.entries(customHeaders)) {
    if (k.toLowerCase() === "cookie") continue;
    headers.set(k, v);
  }

  applyCookie(headers, await getCookie(id));

  const response = await fetch(buildUrl(baseUrl, apiBase, path), {
    ...options,
    headers,
  });

  // Re-authenticate once if the session expired. A userless instance never
  // hits this (it never sent a cookie to expire), so this only fires for a
  // genuinely credentialed instance.
  if (response.status === 401 || response.status === 403) {
    await setCookie(id, null);
    await ensureAuth(id);
    applyCookie(headers, await getCookie(id));
    const retry = await fetch(buildUrl(baseUrl, apiBase, path), {
      ...options,
      headers,
    });
    if (!retry.ok) throw new AdguardHttpError(retry.status, await retry.text());
    return parseAdguardResponse<T>(retry);
  }

  if (!response.ok) throw new AdguardHttpError(response.status, await response.text());
  return parseAdguardResponse<T>(response);
}

/**
 * Clear the stored AdGuard Home session cookie. Call before saving new
 * credentials and before deleting an instance, mirroring qbClearSession /
 * piholeClearSession. With no `instanceId`, clears every cached instance.
 */
export async function adguardClearSession(instanceId?: string): Promise<void> {
  if (instanceId) {
    await setCookie(instanceId, null);
    return;
  }
  const store = useConfigStore.getState();
  const ids = (store.serviceInstances.adguard ?? []).map((i) => i.id);
  for (const id of cookieStores.keys()) ids.push(id);
  for (const id of new Set(ids)) {
    await setCookie(id, null);
  }
}

/**
 * Health-probe variant for the polling health hook — reuses the cached
 * session the same way qbHealthCheck does, so a 30s poll never mints a fresh
 * login (and never counts against authratelimiter's failure budget) when the
 * cached cookie is still good.
 */
export async function adguardHealthCheck(
  instanceId: string,
): Promise<"ok" | "auth_failed" | "offline"> {
  try {
    const status = await adguardRequest<AdguardServerStatus>(
      "/status",
      undefined,
      instanceId,
    );
    if (status && typeof status.version === "string") return "ok";
    return "offline";
  } catch (err) {
    if (err instanceof AdguardRateLimitedError) return "auth_failed";
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("authentication failed") || msg.includes(": 401") || msg.includes(": 403")) {
      return "auth_failed";
    }
    return "offline";
  }
}

// --- Status & Protection ---

export function getStatus(instanceId?: string): Promise<AdguardServerStatus> {
  return adguardRequest<AdguardServerStatus>("/status", undefined, instanceId);
}

// /control/protection. duration is milliseconds; 0 with enabled:false disables
// indefinitely. The endpoint answers 200 with NO body (unlike Pi-hole's
// dns/blocking, which echoes the new state) — return the request we just
// confirmed the server accepted so the caller can seed its own cache rather
// than parsing a response that doesn't exist.
export async function setProtection(
  enabled: boolean,
  duration = 0,
  instanceId?: string,
): Promise<AdguardProtectionRequest> {
  const body: AdguardProtectionRequest = { enabled, duration };
  await adguardRequest<void>(
    "/protection",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    instanceId,
  );
  return body;
}

// --- Stats ---

// recentMs must be a multiple of one hour per the upstream API; omit for the
// server's current default window.
export function getStats(recentMs?: number, instanceId?: string): Promise<AdguardStats> {
  const query = recentMs !== undefined ? `?recent=${recentMs}` : "";
  return adguardRequest<AdguardStats>(`/stats${query}`, undefined, instanceId);
}

export function resetStats(instanceId?: string): Promise<void> {
  return adguardRequest("/stats_reset", { method: "POST" }, instanceId);
}

// --- Query log ---

function queryLogParams(filters: AdguardQueryLogFilters): string {
  const params = new URLSearchParams();
  if (filters.olderThan) params.set("older_than", filters.olderThan);
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  // The upstream API takes `reason` as a repeated query param, one per value.
  for (const reason of filters.reason ?? []) params.append("reason", reason);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getQueryLog(
  filters: AdguardQueryLogFilters = {},
  instanceId?: string,
): Promise<AdguardQueryLogResponse> {
  return adguardRequest<AdguardQueryLogResponse>(
    `/querylog${queryLogParams(filters)}`,
    undefined,
    instanceId,
  );
}

export function clearQueryLog(instanceId?: string): Promise<void> {
  return adguardRequest("/querylog_clear", { method: "POST" }, instanceId);
}

export function getQueryLogConfig(instanceId?: string): Promise<AdguardQueryLogConfig> {
  return adguardRequest<AdguardQueryLogConfig>("/querylog/config", undefined, instanceId);
}

// --- Filtering ---

export function getFilterStatus(instanceId?: string): Promise<AdguardFilterStatus> {
  return adguardRequest<AdguardFilterStatus>("/filtering/status", undefined, instanceId);
}

export function addFilterUrl(
  name: string,
  url: string,
  whitelist: boolean,
  instanceId?: string,
): Promise<void> {
  return adguardRequest(
    "/filtering/add_url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, whitelist }),
    },
    instanceId,
  );
}

export function removeFilterUrl(
  url: string,
  whitelist: boolean,
  instanceId?: string,
): Promise<void> {
  return adguardRequest(
    "/filtering/remove_url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, whitelist }),
    },
    instanceId,
  );
}

// Returns { updated: number }.
export function refreshFilters(
  whitelist: boolean,
  instanceId?: string,
): Promise<{ updated: number }> {
  return adguardRequest<{ updated: number }>(
    "/filtering/refresh",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whitelist }),
    },
    instanceId,
  );
}

export function setUserRules(rules: string[], instanceId?: string): Promise<void> {
  return adguardRequest(
    "/filtering/set_rules",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    },
    instanceId,
  );
}

// --- DNS rewrites (custom records) ---

export function getRewrites(instanceId?: string): Promise<AdguardRewriteEntry[]> {
  return adguardRequest<AdguardRewriteEntry[]>("/rewrite/list", undefined, instanceId);
}

export function addRewrite(
  entry: AdguardRewriteEntry,
  instanceId?: string,
): Promise<void> {
  return adguardRequest(
    "/rewrite/add",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    },
    instanceId,
  );
}

export function updateRewrite(
  target: AdguardRewriteEntry,
  update: AdguardRewriteEntry,
  instanceId?: string,
): Promise<void> {
  return adguardRequest(
    "/rewrite/update",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, update }),
    },
    instanceId,
  );
}

// Deletes byte-for-byte on the stored {domain, answer} pair — same trap as
// Pi-hole's CNAME delete, matching the value exactly rather than a
// re-formatted one.
export function deleteRewrite(
  entry: AdguardRewriteEntry,
  instanceId?: string,
): Promise<void> {
  return adguardRequest(
    "/rewrite/delete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    },
    instanceId,
  );
}

// --- DNS config ---

export function getDnsConfig(instanceId?: string): Promise<AdguardDnsConfig> {
  return adguardRequest<AdguardDnsConfig>("/dns_info", undefined, instanceId);
}

export function setDnsConfig(
  config: Partial<AdguardDnsConfig>,
  instanceId?: string,
): Promise<void> {
  return adguardRequest(
    "/dns_config",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
    instanceId,
  );
}

// --- Version ---

export function getVersionInfo(
  recheckNow = false,
  instanceId?: string,
): Promise<AdguardVersionInfo> {
  return adguardRequest<AdguardVersionInfo>(
    "/version.json",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recheck_now: recheckNow }),
    },
    instanceId,
  );
}

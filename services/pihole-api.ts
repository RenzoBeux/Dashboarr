import { HttpError, serviceRequest } from "@/lib/http-client";
import { GRAVITY_UPDATE_TIMEOUT, SERVICE_DEFAULTS } from "@/lib/constants";
import { buildUrl } from "@/lib/url-builder";
import { useConfigStore } from "@/store/config-store";
import {
  PIHOLE_SID_HEADER,
  dropPiholeSession,
  forgetPiholeSession,
  getPiholeSid,
  piholeSessionEntry,
  piholeSessionIds,
} from "@/lib/pihole-session";
import {
  encodeCnameValue,
  formatCnameRecord,
  parseGravityOutput,
  piholeErrorMessage,
  readCnameRecords,
  toHistorySeries,
  type PiholeCnameRecord,
  type PiholeGravityResult,
  type PiholeHistoryPoint,
} from "@/lib/pihole-normalize";
import type {
  PiholeAuthResponse,
  PiholeBlockingStatus,
  PiholePadd,
  PiholeQueriesResponse,
  PiholeQueryFilters,
  PiholeQuerySuggestions,
  PiholeSummary,
  PiholeTopClientsResponse,
  PiholeTopDomainsResponse,
  PiholeUpstreamsResponse,
  PiholeVersionResponse,
} from "@/lib/types";

/**
 * Pi-hole v6 API client.
 *
 * Wire notes:
 *   - v6 ONLY. v5's PHP /admin/api.php is gone; runConnectionProbe detects a v5
 *     host and says so rather than reporting a bad password.
 *   - Auth is a session, not a key: POST /api/auth {password} returns a SID that
 *     rides on every later call as the X-FTL-SID header.
 *   - Sessions idle out after 30 minutes and FTL allows only
 *     `webserver.api.max_sessions` (default 16) at once, so the SID is cached
 *     per instance in lib/pihole-session.ts and shared with the health probe.
 *     Concurrent logins are de-duplicated; expiry costs exactly one retry.
 *   - Errors are nested (`{"error":{"key","message"}}`), which the shared
 *     getHttpErrorMessage cannot see — piholeErrorMessage handles it.
 *   - POST /api/action/gravity answers chunked text/plain, not JSON.
 *
 * This goes through serviceRequest rather than owning a transport (the way
 * Deluge and qBittorrent do) because none of their reasons apply: Pi-hole is
 * plain REST, and the one thing serviceRequest cannot do — read a response
 * HEADER — is never needed here. Wrapping keeps the off-WiFi LAN guard, demo
 * mode, the custom-header merge, abort composition and the auth-proxy guard.
 *
 * Per-instance routing: every function takes an optional trailing `instanceId`.
 * When omitted, the user's active Pi-hole is used.
 */

/** Best-effort logout — short, because nothing waits on the result. */
const LOGOUT_TIMEOUT_MS = 5_000;

function resolveInstanceId(instanceId?: string): string {
  if (instanceId) return instanceId;
  const id = useConfigStore.getState().getActiveInstanceId("pihole");
  if (!id) throw new Error("No Pi-hole instance configured");
  return id;
}

/**
 * Exchange the configured password for a SID.
 *
 * Never call this directly — go through ensureSession, which de-duplicates
 * concurrent attempts. Each bare call costs one of sixteen session seats.
 */
async function login(instanceId: string): Promise<string> {
  const password =
    useConfigStore.getState().instanceSecrets[instanceId]?.password ?? "";
  let res: PiholeAuthResponse;
  try {
    res = await serviceRequest<PiholeAuthResponse>("pihole", "/auth", {
      method: "POST",
      body: JSON.stringify({ password }),
      instanceId,
    });
  } catch (err) {
    // A 401 here is EITHER a wrong password OR api_seats_exceeded — the same
    // status for two unrelated problems. piholeErrorMessage reads error.key and
    // says which, because "wrong password" would send the user to change a
    // working password, invalidating every session and making it worse.
    throw new Error(piholeErrorMessage(err) ?? "Pi-hole rejected the password");
  }
  const session = res?.session;
  if (!session?.valid) {
    throw new Error(session?.message || "Pi-hole authentication failed");
  }
  // valid:true with sid:null means this Pi-hole has no password configured at
  // all. Cache "" so ensureSession treats it as a real session and stops
  // re-logging in on every single request.
  return session.sid ?? "";
}

/**
 * The cached SID, logging in if there is none and sharing one in-flight attempt
 * across every concurrent caller.
 *
 * The de-duplication is load-bearing, not an optimisation: opening the Pi-hole
 * screen fires roughly six queries in one tick, which without it is six of the
 * sixteen available seats spent on a single render.
 */
async function ensureSession(instanceId: string): Promise<string> {
  const entry = piholeSessionEntry(instanceId);
  if (entry.sid !== null) return entry.sid;
  if (entry.loginPromise) return entry.loginPromise;

  const generation = entry.generation;
  const attempt = login(instanceId)
    .then((sid) => {
      // Only publish if nothing invalidated the session while we were in
      // flight; otherwise this SID belongs to a superseded generation.
      if (entry.generation === generation) entry.sid = sid;
      return sid;
    })
    .finally(() => {
      if (entry.loginPromise === attempt) entry.loginPromise = null;
    });
  entry.loginPromise = attempt;
  return attempt;
}

interface PiholeRequestOptions {
  method?: string;
  body?: string;
  timeout?: number;
  params?: Record<string, string | number | boolean>;
  instanceId?: string;
}

/** One authenticated call, with a single retry when the session has expired. */
async function piholeRequest<T>(
  path: string,
  opts: PiholeRequestOptions = {},
): Promise<T> {
  const { instanceId, ...rest } = opts;

  // Demo mode BEFORE resolving the instance and before any handshake: the demo
  // router answers every path, and enableDemoMode clears instanceSecrets, so a
  // login here would post an empty password at a host that does not exist.
  if (useConfigStore.getState().demoMode) {
    return serviceRequest<T>("pihole", path, rest);
  }

  const id = resolveInstanceId(instanceId);

  const attempt = async (retried: boolean): Promise<T> => {
    const sid = await ensureSession(id);
    // "" is the no-password-configured case — send no header rather than an
    // empty one, which FTL would reject.
    const headers = sid ? { [PIHOLE_SID_HEADER]: sid } : undefined;
    try {
      return await serviceRequest<T>("pihole", path, {
        ...rest,
        instanceId: id,
        headers,
      });
    } catch (err) {
      // Expired (the 30-minute idle TTL), evicted by another client hitting
      // max_sessions, or invalidated by a password / app-password change.
      // Exactly ONE retry: a second 401 is a real rejection, and looping would
      // spend a seat per attempt.
      if (!retried && err instanceof HttpError && err.status === 401) {
        dropPiholeSession(id);
        return attempt(true);
      }
      throw err;
    }
  };

  return attempt(false);
}

/**
 * Drop the cached session for an instance (or all of them), logging it out
 * server-side first.
 *
 * Async and DELETE-ing on purpose, unlike Deluge's fire-and-forget sync clear:
 * with only sixteen seats and a thirty-minute idle TTL, leaking one on every
 * password change is not free. Called from the integrations editor on save and
 * on delete, and from the instance list on delete.
 */
export async function piholeClearSession(instanceId?: string): Promise<void> {
  const ids = instanceId ? [instanceId] : piholeSessionIds();
  await Promise.all(
    ids.map(async (id) => {
      const sid = getPiholeSid(id);
      dropPiholeSession(id);
      if (sid) {
        // Best effort: the credentials may already be gone, and a failure here
        // just means the seat ages out on its own.
        await logoutSid(id, sid).catch(() => undefined);
      }
      forgetPiholeSession(id);
    }),
  );
}

/**
 * DELETE /api/auth for one SID.
 *
 * Built by hand rather than through piholeRequest because that would call
 * ensureSession and mint a replacement for the session we are trying to end.
 */
async function logoutSid(instanceId: string, sid: string): Promise<void> {
  const store = useConfigStore.getState();
  if (store.demoMode) return;
  const baseUrl = store.getActiveUrl("pihole", instanceId);
  if (!baseUrl) return;
  const url = buildUrl(baseUrl, SERVICE_DEFAULTS.pihole.apiBasePath, "/auth");
  // Bounded: this runs on save and on delete, and a Pi-hole is usually a LAN
  // address. Deleting an instance while off the home network would otherwise
  // hang on the platform's default socket timeout with the UI waiting on it.
  // Losing the logout only means the seat idles out on its own.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "DELETE",
      headers: { [PIHOLE_SID_HEADER]: sid },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Blocking ---------------------------------------------------------------

export function getBlocking(instanceId?: string): Promise<PiholeBlockingStatus> {
  return piholeRequest<PiholeBlockingStatus>("/dns/blocking", { instanceId });
}

/**
 * Enable or disable blocking, optionally with a timer.
 *
 * `timer` is a DURATION in seconds after which FTL flips back automatically;
 * null makes the new mode permanent. The response echoes the resulting state,
 * so callers can seed their cache from it instead of paying a round trip.
 */
export function setBlocking(
  blocking: boolean,
  timer: number | null,
  instanceId?: string,
): Promise<PiholeBlockingStatus> {
  return piholeRequest<PiholeBlockingStatus>("/dns/blocking", {
    method: "POST",
    body: JSON.stringify({ blocking, timer }),
    instanceId,
  });
}

// --- Gravity ----------------------------------------------------------------

/**
 * Run `pihole -g`.
 *
 * FTL streams the script's stdout as chunked text/plain, which serviceRequest's
 * non-JSON fallback hands back as one string. React Native's fetch buffers the
 * whole body, so there is NO incremental progress available here — reading it
 * live would mean hand-rolling XMLHttpRequest with onprogress and
 * re-implementing the LAN guard, demo routing and abort composition around it,
 * for a shell log nobody reads on a phone. Deliberate non-goal.
 *
 * Note the call cannot be cancelled: aborting only stops us reading, gravity
 * keeps running server-side. Callers must treat a timeout as "still running"
 * and confirm via stats/summary's gravity.last_update, never report failure.
 *
 * Not gated by webserver.api.allow_destructive — only restartdns and the
 * flush/* routes are (FTL src/api/action.c) — so this works on a stock install.
 */
export async function runGravity(instanceId?: string): Promise<PiholeGravityResult> {
  const raw = await piholeRequest<string>("/action/gravity", {
    method: "POST",
    timeout: GRAVITY_UPDATE_TIMEOUT,
    instanceId,
  });
  return parseGravityOutput(typeof raw === "string" ? raw : "");
}

// --- Stats ------------------------------------------------------------------

export function getSummary(instanceId?: string): Promise<PiholeSummary> {
  return piholeRequest<PiholeSummary>("/stats/summary", { instanceId });
}

export function getTopDomains(
  opts: { blocked?: boolean; count?: number } = {},
  instanceId?: string,
): Promise<PiholeTopDomainsResponse> {
  return piholeRequest<PiholeTopDomainsResponse>("/stats/top_domains", {
    params: { blocked: opts.blocked ?? false, count: opts.count ?? 10 },
    instanceId,
  });
}

export function getTopClients(
  opts: { blocked?: boolean; count?: number } = {},
  instanceId?: string,
): Promise<PiholeTopClientsResponse> {
  return piholeRequest<PiholeTopClientsResponse>("/stats/top_clients", {
    params: { blocked: opts.blocked ?? false, count: opts.count ?? 10 },
    instanceId,
  });
}

export function getUpstreams(instanceId?: string): Promise<PiholeUpstreamsResponse> {
  return piholeRequest<PiholeUpstreamsResponse>("/stats/upstreams", { instanceId });
}

export async function getRecentBlocked(
  count = 1,
  instanceId?: string,
): Promise<string[]> {
  const res = await piholeRequest<{ blocked?: string[] }>("/stats/recent_blocked", {
    params: { count },
    instanceId,
  });
  return Array.isArray(res?.blocked) ? res.blocked : [];
}

/** 24h of 10-minute buckets, normalized to ms timestamps for the chart. */
export async function getHistory(instanceId?: string): Promise<PiholeHistoryPoint[]> {
  const res = await piholeRequest<unknown>("/history", { instanceId });
  return toHistorySeries(res);
}

/** One aggregated call for the dashboard widget — five endpoints' worth. */
export function getPadd(instanceId?: string): Promise<PiholePadd> {
  return piholeRequest<PiholePadd>("/padd", { instanceId });
}

// --- Query log --------------------------------------------------------------

/**
 * Map our camelCased filters onto FTL's snake_case wire params.
 *
 * Undefined keys are omitted entirely: an empty `domain=` is a real filter to
 * FTL ("domains equal to the empty string"), not "no filter".
 */
function queryParams(
  filters: PiholeQueryFilters,
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  const wire: [keyof PiholeQueryFilters, string][] = [
    ["length", "length"],
    ["cursor", "cursor"],
    ["from", "from"],
    ["until", "until"],
    ["domain", "domain"],
    ["clientIp", "client_ip"],
    ["clientName", "client_name"],
    ["upstream", "upstream"],
    ["type", "type"],
    ["status", "status"],
    ["reply", "reply"],
    ["dnssec", "dnssec"],
    ["disk", "disk"],
  ];
  for (const [key, name] of wire) {
    const value = filters[key];
    if (value === undefined || value === null || value === "") continue;
    params[name] = value as string | number | boolean;
  }
  return params;
}

export function getQueries(
  filters: PiholeQueryFilters = {},
  instanceId?: string,
): Promise<PiholeQueriesResponse> {
  return piholeRequest<PiholeQueriesResponse>("/queries", {
    params: queryParams(filters),
    instanceId,
  });
}

export function getQuerySuggestions(
  instanceId?: string,
): Promise<PiholeQuerySuggestions> {
  return piholeRequest<PiholeQuerySuggestions>("/queries/suggestions", { instanceId });
}

// --- Local CNAME records ----------------------------------------------------

const CNAME_ELEMENT = "/config/dns/cnameRecords";

export async function getCnameRecords(
  instanceId?: string,
): Promise<PiholeCnameRecord[]> {
  const res = await piholeRequest<unknown>(CNAME_ELEMENT, { instanceId });
  return readCnameRecords(res);
}

/**
 * Add one record.
 *
 * buildUrl concatenates the path verbatim and only encodes query params, so the
 * value has to be percent-encoded here — the comma separator especially.
 * No `?restart=false`: that flag is for batching several edits, and a record
 * that does not restart FTL does not take effect.
 */
export function addCnameRecord(
  input: { cname: string; target: string; ttl?: number | null },
  instanceId?: string,
): Promise<void> {
  const value = encodeCnameValue(formatCnameRecord(input));
  return piholeRequest<void>(`${CNAME_ELEMENT}/${value}`, {
    method: "PUT",
    instanceId,
  });
}

/**
 * Delete one record.
 *
 * Takes the parsed record and sends `record.raw`, NOT a re-formatted value:
 * FTL matches the path against the stored config array byte-for-byte, so
 * normalizing "a.com , b.com" to "a.com,b.com" 404s while the record stays.
 */
export function deleteCnameRecord(
  record: PiholeCnameRecord,
  instanceId?: string,
): Promise<void> {
  const value = encodeCnameValue(record.raw);
  return piholeRequest<void>(`${CNAME_ELEMENT}/${value}`, {
    method: "DELETE",
    instanceId,
  });
}

// --- Version ----------------------------------------------------------------

export function getVersion(instanceId?: string): Promise<PiholeVersionResponse> {
  return piholeRequest<PiholeVersionResponse>("/info/version", { instanceId });
}

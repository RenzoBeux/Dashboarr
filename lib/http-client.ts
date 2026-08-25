import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { buildUrl } from "@/lib/url-builder";
import { getDemoResponse } from "@/lib/demo-data";
import { isPrivateUrl, normalizeServiceUrl } from "@/lib/url-validation";
import {
  basicAuthHeader,
  digestSessionKey,
  fetchWithDigestRetry,
  listAuthSchemes,
  parseAuthChallenges,
  parseDigestChallenge,
} from "@/lib/http-auth";

export { buildUrl };

const DEFAULT_TIMEOUT = 15000;

/**
 * A private/LAN host (192.168.x, 10.x, mDNS, …) is unreachable once we leave
 * the local network. Issuing the fetch anyway doesn't fail fast — it sits in
 * TCP connect until the abort timeout, and because the health grid awaits the
 * whole probe batch, one such hang freezes every dot red (the Glances/#106
 * report). Short-circuit when we KNOW we're off WiFi.
 *
 * Gated on `isOnWifi === false` (confirmed), so `null` (cold start, not yet
 * determined) never short-circuits a URL that might be fine. On non-home WiFi
 * we still attempt it — the bounded probe timeout handles that case, and the
 * existing away→remote URL resolution already keeps the LAN URL out of those
 * requests when auto-switch is on.
 *
 * Two things void the "private ⇒ unreachable" premise, both requiring a LIVE
 * tunnel (`isVpnActive`); without one the guard always stands, so the #106
 * fail-fast is untouched:
 *
 *  1. The user opted to trust the VPN as home (`treatVpnAsHome`): WireGuard/
 *     OpenVPN/Tailscale subnet routes carry the private ranges into the tunnel,
 *     so the LAN URL may be reachable from anywhere (#185).
 *  2. The URL being requested is the instance's **Remote URL** (#356). That
 *     slot is the address the user declared for "when I'm away", so a private
 *     one there is a deliberate statement that it is reachable through their
 *     tunnel — a ZeroTier/WireGuard-assigned 10.x, or a LAN address the tunnel
 *     routes. Blocking it made the health dots red while Test Connection (which
 *     skips this guard) reported the very same URL as connected, and it forced
 *     users onto the global `treatVpnAsHome` opt-in — which then resolves to the
 *     LOCAL URL, the one their tunnel can't reach.
 *
 * A VPN without either condition is NOT trusted to reach the LOCAL URL, so the
 * guard stays up for that slot — otherwise any tunnel (even to a hostile
 * network) would silently make the private local URL "work" off Wi-Fi,
 * contradicting the opt-in. This keeps the local-slot guard aligned with
 * `getActiveUrl`/`evaluateHomeNetwork`, which only treat a VPN as home when
 * `treatVpnAsHome` is on.
 */
function lanUnreachableOffWifi(
  url: string,
  inst?: { remoteUrl: string },
): boolean {
  const store = useConfigStore.getState();
  // Demo mode never hits the network (probes return canned data), so don't let
  // the guard short-circuit demo services to offline when testing on cellular.
  if (store.demoMode) return false;
  if (store.isVpnActive && store.treatVpnAsHome) return false;
  if (store.isVpnActive && isRemoteSlotUrl(url, inst)) return false;
  return store.isOnWifi === false && isPrivateUrl(url);
}

/**
 * Whether `url` is the one `getActiveUrl` took from the instance's Remote URL
 * field. Compared post-`normalizeServiceUrl` because that's what `getActiveUrl`
 * returns; an empty Remote URL never matches.
 */
function isRemoteSlotUrl(url: string, inst?: { remoteUrl: string }): boolean {
  const remote = normalizeServiceUrl(inst?.remoteUrl ?? "");
  return remote !== "" && remote === url;
}

/**
 * Why the guard tripped, appended to both the thrown error and the health-grid
 * message. "(no VPN detected)" was previously printed unconditionally, which
 * read as a lie to the one group most likely to see it — users with a tunnel up
 * whose local URL it can't route (#356). Name the actual setting instead.
 */
function lanGuardReason(): string {
  return useConfigStore.getState().isVpnActive
    ? "VPN detected, but Treat VPN as home is off"
    : "no VPN detected";
}

/**
 * The guard's verdict for UI that has to explain a disagreement (#356): the
 * settings "Test" button fires at the URL you typed and deliberately skips the
 * guard, so a URL can answer there while the health probes short-circuit it.
 * Returns null when nothing is being blocked, otherwise the reason to show.
 *
 * `inst` carries the IN-PROGRESS Remote URL from the form, not the saved one,
 * so the remote-slot stand-down is judged against what the user is about to
 * save.
 */
export function lanGuardBlockReason(
  url: string,
  inst?: { remoteUrl: string },
): string | null {
  return lanUnreachableOffWifi(url, inst) ? lanGuardReason() : null;
}

interface RequestOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  params?: Record<string, string | number | boolean>;
  // Target a specific service instance. When omitted, the active instance for
  // the kind is used (legacy single-instance behavior). Step 3 threads this
  // explicitly from the hooks layer so multi-instance setups can route each
  // request to the right server.
  instanceId?: string;
  // External abort signal (e.g. TanStack Query's queryFn signal). Composed
  // with the internal timeout controller: the fetch aborts when either fires.
  signal?: AbortSignal;
}

const REDACT_PARAMS = ["x-plex-token", "apikey", "api_key", "token"];

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of Array.from(u.searchParams.keys())) {
      if (REDACT_PARAMS.includes(key.toLowerCase())) {
        u.searchParams.set(key, "***");
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

export class HttpError extends Error {
  // Parsed response body, if the server returned one. Useful for surfacing
  // *arr error messages (e.g. `{ message: "Indexer not configured" }`) to
  // the UI instead of the bare HTTP status.
  public body?: unknown;

  constructor(
    public status: number,
    public statusText: string,
    public url: string,
    body?: unknown,
  ) {
    const safe = redactUrl(url);
    super(`HTTP ${status} ${statusText} — ${safe}`);
    this.url = safe;
    this.name = "HttpError";
    this.body = body;
  }
}

// An authentication proxy (Authentik, Authelia, Cloudflare Access, …) placed in
// front of a service answers unauthenticated requests with its own HTML login
// page instead of proxying through to the API. The app sends the service's API
// key but holds no proxy session, so it receives that login page — often with a
// 200, sometimes a 302/401/403. We detect it and throw this so the UI shows an
// actionable message instead of crashing when downstream code runs array methods
// on what it assumed was JSON (issue #239).
export const AUTH_PROXY_MESSAGE =
  "This service is behind an authentication proxy. The server returned an HTML " +
  "login page instead of data, which usually means a reverse proxy like Authentik " +
  "or Authelia is intercepting the request. Add an exception for this app's API " +
  "path in your proxy, or send the proxy's auth headers under Custom Headers in " +
  "the service settings.";

export class AuthProxyResponseError extends HttpError {
  constructor(status: number, statusText: string, url: string, body?: unknown) {
    super(status, statusText, url, body);
    this.name = "AuthProxyResponseError";
    // Override the bare "HTTP 200 …" message HttpError builds with an actionable
    // one. ErrorBanner/ErrorBoundary fall back to error.message (an HTML body is
    // too long for getHttpErrorMessage to extract), so this is what users see;
    // formatErrorForCopy still reports status + redacted URL + body for debugging.
    this.message = AUTH_PROXY_MESSAGE;
  }
}

// True when a response body is (or looks like) an HTML document rather than the
// expected JSON/XML payload. Checks the content-type first, then cheaply sniffs
// the body head so a proxy that mislabels or omits the content-type is still
// caught. rtorrent's XML-RPC responses start with "<?xml" and never match here,
// so the one legitimate non-JSON caller is unaffected.
function looksLikeHtml(contentType: string | null, body: unknown): boolean {
  if (contentType && contentType.toLowerCase().includes("text/html")) return true;
  if (typeof body !== "string") return false;
  const head = body.slice(0, 256).trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

// *arr 4xx responses look like `{ message, description }` — surface that
// message to the user when present, falling back to a string body, then to
// the HTTP status line.
export function getHttpErrorMessage(err: unknown): string | undefined {
  if (!(err instanceof HttpError)) return undefined;
  const body = err.body;
  if (body && typeof body === "object" && "message" in body) {
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }
  if (typeof body === "string" && body.length > 0 && body.length < 300) return body;
  return undefined;
}

// RN/Hermes has no DOMException global; aborted fetches reject with a plain
// Error named "AbortError". True for both the internal timeout abort and an
// external (query-cancellation) abort.
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

// Produce a verbose, paste-friendly representation of any caught error.
// Used as the clipboard payload for error toasts so users can share or
// search the underlying cause even when the toast shows a friendly summary.
// URLs are already API-key-redacted by HttpError, so this is safe to share.
export function formatErrorForCopy(err: unknown): string {
  if (err instanceof HttpError) {
    const lines: string[] = [];
    lines.push(`HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ""}`);
    lines.push(err.url);
    if (err.body !== undefined && err.body !== null) {
      let bodyStr: string;
      if (typeof err.body === "string") {
        bodyStr = err.body;
      } else {
        try {
          bodyStr = JSON.stringify(err.body, null, 2);
        } catch {
          bodyStr = String(err.body);
        }
      }
      if (bodyStr.length > 0) lines.push(bodyStr);
    }
    return lines.join("\n");
  }
  if (err instanceof Error) {
    const parts = [`${err.name}: ${err.message}`];
    if (err.stack) parts.push(err.stack);
    return parts.join("\n");
  }
  try {
    return typeof err === "string" ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Services whose API sits behind an HTTP auth mount rather than an API key.
 * These send Basic by default and upgrade to Digest when the server asks.
 * Derived from the `httpAuth` flag on SERVICE_DEFAULTS so the list cannot
 * drift from the per-service branches below. Transmission carries the flag too
 * but has its own transport in services/transmission-api.ts, which calls
 * fetchWithDigestRetry directly.
 */
function usesHttpAuth(serviceId: ServiceId): boolean {
  return SERVICE_DEFAULTS[serviceId].httpAuth === true;
}

export async function serviceRequest<T>(
  serviceId: ServiceId,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    params,
    instanceId,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    // NZBGet dispatches off the JSON-RPC method name in the request body, not
    // the path or query params — pass body through so the demo router can read
    // it. Other services ignore the third arg.
    const body = typeof fetchOptions.body === "string" ? fetchOptions.body : undefined;
    return (getDemoResponse(serviceId, path, params, body, fetchOptions.method) ??
      undefined) as T;
  }

  const targetId = instanceId ?? store.getActiveInstanceId(serviceId);
  if (!targetId) {
    throw new Error(`Service ${serviceId} has no configured instance`);
  }
  const inst = store.getInstance(serviceId, targetId);
  if (!inst) {
    throw new Error(`Instance ${targetId} for ${serviceId} not found`);
  }
  const secrets = store.instanceSecrets[targetId] ?? {};
  const defaults = SERVICE_DEFAULTS[serviceId];

  if (!inst.enabled) {
    throw new Error(`Service ${serviceId} is not enabled`);
  }

  const baseUrl = store.getActiveUrl(serviceId, targetId);
  if (!baseUrl) {
    throw new Error(`No URL configured for ${serviceId}`);
  }
  // Fail fast instead of hanging on an unreachable LAN address off WiFi.
  // Slot-neutral wording: with no VPN up the guard keys on the URL's host, so a
  // private address in the Remote URL slot trips it too (#185).
  if (lanUnreachableOffWifi(baseUrl, inst)) {
    throw new Error(
      `${serviceId}: private LAN address not reachable off Wi-Fi (${lanGuardReason()})`,
    );
  }

  // SABnzbd and Jackett auth live in the query string (?apikey=…), not
  // headers. Merge defaults into the caller-supplied params so service
  // modules don't have to know about either of those parameters.
  const finalParams =
    serviceId === "sabnzbd"
      ? { ...(params ?? {}), apikey: secrets.apiKey ?? "", output: "json" }
      : serviceId === "jackett"
        ? { ...(params ?? {}), apikey: secrets.apiKey ?? "" }
        : params;

  const url = buildUrl(baseUrl, defaults.apiBasePath, path, finalParams);

  const headers = new Headers(fetchOptions.headers);

  // Apply user-supplied custom headers (global + per-instance merged) FIRST so
  // service auth headers below can overwrite on collision. Reverse-proxy
  // headers like CF-Access-Client-Id rarely collide; this just guards the
  // user from accidentally pasting `X-Api-Key` and breaking service auth.
  const customHeaders = store.getMergedHeaders(serviceId, targetId);
  for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);

  // Inject auth headers based on service type
  if (serviceId === "qbittorrent") {
    // qBittorrent uses cookie-based auth — handled by the cookie jar
    // The login function must be called first to establish the session
  } else if (serviceId === "sabnzbd" || serviceId === "jackett") {
    // apikey is injected as a query param above — no header needed
  } else if (usesHttpAuth(serviceId)) {
    // HTTP auth mount in front of the API: NZBGet's ControlUsername/Password,
    // Glances' optional server auth, the web server in front of rtorrent's
    // XML-RPC mount. basicAuthHeader sends on EITHER field, matching the probe
    // (a token-in-password setup is valid), and a Digest server rejects Basic
    // so fetchWithDigestRetry answers the challenge below.
    const basic = basicAuthHeader(secrets.username, secrets.password);
    if (basic) headers.set("Authorization", basic);
    // NZBGet is JSON-RPC over POST, so default the content type here and let
    // services/nzbget-api.ts pass the body. rtorrent must NOT get this:
    // services/rtorrent-api.ts sets Content-Type: text/xml itself.
    if (serviceId === "nzbget") headers.set("Content-Type", "application/json");
  } else if (serviceId === "plex") {
    if (secrets.apiKey) {
      headers.set("X-Plex-Token", secrets.apiKey);
      headers.set("Accept", "application/json");
    }
  } else if (serviceId === "jellyfin" || serviceId === "emby") {
    // Emby and Jellyfin both authenticate with the X-Emby-Token header.
    if (secrets.apiKey) {
      headers.set("X-Emby-Token", secrets.apiKey);
    }
  } else if (serviceId === "tracearr") {
    // Tracearr's public API uses a Bearer token (Authorization: Bearer
    // trr_pub_<token>). Image-proxy URLs are public, so only API calls need it.
    if (secrets.apiKey) {
      headers.set("Authorization", `Bearer ${secrets.apiKey}`);
    }
  } else {
    // Radarr, Sonarr, Overseerr, Tautulli, Prowlarr, Bazarr, unRAID use
    // X-Api-Key (unRAID documents lowercase x-api-key; header names are
    // case-insensitive so this one branch covers it).
    if (secrets.apiKey) {
      headers.set("X-Api-Key", secrets.apiKey);
    }
  }

  // FormData bodies (SAB addfile upload) must keep fetch's own multipart
  // Content-Type — the boundary parameter is generated per-request and a
  // manual header would omit it, breaking the upload.
  if (
    !headers.has("Content-Type") &&
    fetchOptions.body &&
    !(fetchOptions.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  // No AbortSignal.any on RN/Hermes — compose the external signal with the
  // timeout controller by hand. Double-abort is a spec no-op.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }

  try {
    const fetchInit = { ...fetchOptions, signal: controller.signal };
    const response = usesHttpAuth(serviceId)
      ? await fetchWithDigestRetry(
          url,
          fetchInit,
          headers,
          secrets.username,
          secrets.password,
          digestSessionKey(targetId, baseUrl),
        )
      : await fetch(url, { ...fetchInit, headers });

    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      // The body stream can only be read once — clone before trying JSON so
      // we can fall back to text() if the response isn't JSON.
      const clone = response.clone();
      const errorBody = await response
        .json()
        .catch(() => clone.text().catch(() => undefined));
      // A failing status whose body is an HTML login page is an auth proxy in
      // front of the service, not the service itself — surface that.
      if (looksLikeHtml(contentType, errorBody)) {
        throw new AuthProxyResponseError(
          response.status,
          response.statusText,
          url,
          errorBody,
        );
      }
      throw new HttpError(response.status, response.statusText, url, errorBody);
    }

    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    // Not JSON. A 2xx HTML body is almost always an auth-proxy login page
    // returned in place of the API response (issue #239): the request carried
    // the service API key but no proxy session, so the proxy answered with its
    // login page and a 200. Returning that string lets callers run array methods
    // on it and crash with "undefined is not a function"; throw instead. Genuine
    // non-JSON payloads (rtorrent's XML-RPC, which starts with <?xml) pass through.
    const body = await response.text();
    if (looksLikeHtml(contentType, body)) {
      throw new AuthProxyResponseError(
        response.status,
        response.statusText,
        url,
        body,
      );
    }
    return body as unknown as T;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Ping a service to check connectivity. Returns response time in ms or null if offline.
 * Pass `urlOverride` to test a specific URL (e.g. unsaved form value) instead of the stored one.
 * Pass `instanceId` to ping a specific instance instead of the active one.
 */
export async function pingService(
  serviceId: ServiceId,
  urlOverride?: string,
  instanceId?: string,
): Promise<number | null> {
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId(serviceId);
  if (!targetId) return null;
  const inst = store.getInstance(serviceId, targetId);
  if (!inst) return null;
  const secrets = store.instanceSecrets[targetId] ?? {};
  const defaults = SERVICE_DEFAULTS[serviceId];

  const baseUrl = urlOverride ?? store.getActiveUrl(serviceId, targetId);
  if (!baseUrl) return null;
  // Don't hang pinging a LAN address off WiFi. Skipped only for the stored URL;
  // an explicit urlOverride (form "Test" value) is always attempted so the user
  // can validate a local URL even while away.
  if (!urlOverride && lanUnreachableOffWifi(baseUrl, inst)) return null;

  // SAB has no /system endpoint to GET — it advertises version through the
  // single /api?mode=version handler, so we synthesize the ping URL from the
  // mode + apikey params. Jackett's apikey also lives in the query string;
  // t=indexers lists configured indexers without querying any tracker, making
  // it the cheapest apikey-validated GET Jackett has.
  const pingParams: Record<string, string> | undefined =
    serviceId === "sabnzbd"
      ? { mode: "version", apikey: secrets.apiKey ?? "", output: "json" }
      : serviceId === "jackett"
        ? { t: "indexers", configured: "true", apikey: secrets.apiKey ?? "" }
        : undefined;

  const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath, pingParams);

  const headers = new Headers();

  // Same custom-then-auth ordering as serviceRequest so the proxy lets the
  // ping through and service auth still wins on collision.
  const customHeaders = store.getMergedHeaders(serviceId, targetId);
  for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);

  if (serviceId === "plex") {
    if (secrets.apiKey) headers.set("X-Plex-Token", secrets.apiKey);
    headers.set("Accept", "application/json");
  } else if (serviceId === "jellyfin" || serviceId === "emby") {
    if (secrets.apiKey) headers.set("X-Emby-Token", secrets.apiKey);
  } else if (usesHttpAuth(serviceId)) {
    // Same credential rule as serviceRequest — the `&&` this used to require
    // left a token-in-password instance pinged anonymously. No Digest retry
    // here on purpose: a ping only asks "is anything answering", and 401 is
    // already < 500 (reachable), so answering the challenge would cost a round
    // trip without changing the verdict. Credential validity is checkInstance-
    // Health's job, and that goes through the full probe.
    const basic = basicAuthHeader(secrets.username, secrets.password);
    if (basic) headers.set("Authorization", basic);
    if (serviceId === "nzbget" || serviceId === "transmission") {
      headers.set("Content-Type", "application/json");
    }
  } else if (serviceId === "sabnzbd" || serviceId === "jackett") {
    // apikey already in query params
  } else if (serviceId === "tracearr") {
    if (secrets.apiKey) headers.set("Authorization", `Bearer ${secrets.apiKey}`);
  } else if (serviceId === "jellystat") {
    if (secrets.apiKey) headers.set("x-api-token", secrets.apiKey);
  } else if (serviceId !== "qbittorrent") {
    if (secrets.apiKey) headers.set("X-Api-Key", secrets.apiKey);
  }

  if (useConfigStore.getState().demoMode) return 45;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    // Two services have no GET ping endpoint and must POST instead: NZBGet's
    // JSON-RPC `version` lives at /jsonrpc and rejects GET; rtorrent's /RPC2
    // SCGI mount only speaks XML-RPC, so a GET hits nothing (or ruTorrent's
    // HTML, which would read as a false "online").
    const isNzbget = serviceId === "nzbget";
    const isRtorrent = serviceId === "rtorrent";
    const isTransmission = serviceId === "transmission";
    const isUnraid = serviceId === "unraid";
    let method = "GET";
    let body: string | undefined;
    if (isNzbget) {
      method = "POST";
      body = JSON.stringify({ version: "1.1", method: "version", params: [] });
    } else if (isRtorrent) {
      method = "POST";
      body =
        '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params></params></methodCall>';
      headers.set("Content-Type", "text/xml");
    } else if (isTransmission) {
      // No GET ping — POST session-get. A 409 (CSRF challenge) is < 500, so it
      // still reads as reachable.
      method = "POST";
      body = JSON.stringify({ method: "session-get" });
      headers.set("Content-Type", "application/json");
    } else if (isUnraid) {
      // unRAID's /graphql rejects GET — POST the cheapest valid document.
      // `{__typename}` needs no schema knowledge; even an errors[] response
      // (< 500) proves the endpoint is alive.
      method = "POST";
      body = JSON.stringify({ query: "{__typename}" });
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, {
      method,
      body,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // Any HTTP response (even 4xx) means the service is reachable
    return response.status < 500 ? Date.now() - start : null;
  } catch {
    return null;
  }
}

/**
 * Rich connection test that validates BOTH URL reachability AND credentials.
 *
 * Differs from `pingService` in two ways:
 *   - reads credentials from the caller (the in-progress form values), not
 *     the saved SecureStore record, so users can validate before saving
 *   - returns auth_failed separately from unreachable, by probing an
 *     endpoint that genuinely requires authentication on each service.
 *
 * Services without an authenticated `pingPath` (Plex `/identity`, Jellyfin
 * `/System/Info/Public`, Overseerr `/status`) use a different probe path
 * here. Services that always return HTTP 200 for bad credentials (SABnzbd,
 * Tautulli, qBittorrent) inspect the response body to detect auth failure.
 */
export type ConnectionTestResult =
  | { kind: "ok"; responseTime: number }
  | { kind: "auth_failed"; message: string }
  | { kind: "unreachable"; message: string };

export interface ConnectionTestInput {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
  // Per-instance custom headers from the editor form. Merged on top of the
  // global headers from the store the same way serviceRequest does, so the
  // probe matches the wire shape of real requests (reverse-proxy headers,
  // overrides, etc.).
  customHeaders?: Record<string, string>;
  // The instance these values belong to, when they came from storage rather
  // than an unsaved form. Only used to key the Digest session cache the same
  // way serviceRequest does, so a health check and the real requests that
  // follow it share one server nonce instead of each paying a 401.
  instanceId?: string;
}

export async function testServiceConnection(
  serviceId: ServiceId,
  input: ConnectionTestInput,
): Promise<ConnectionTestResult> {
  const store = useConfigStore.getState();
  if (store.demoMode) {
    return { kind: "ok", responseTime: 45 };
  }

  const baseUrl = input.url.trim();
  if (!baseUrl) {
    return { kind: "unreachable", message: "No URL configured" };
  }

  const customHeaders: Record<string, string> = {
    ...store.globalCustomHeaders,
    ...(input.customHeaders ?? {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  const start = Date.now();

  try {
    const result = await runConnectionProbe(
      serviceId,
      baseUrl,
      input,
      customHeaders,
      controller.signal,
    );
    if (result.kind === "ok") {
      return { kind: "ok", responseTime: Date.now() - start };
    }
    return result;
  } catch (err) {
    // AbortError = our 8s timeout fired.
    if (isAbortError(err)) {
      return { kind: "unreachable", message: "Request timed out" };
    }
    return {
      kind: "unreachable",
      message:
        err instanceof TypeError
          ? "Network error — check URL and connectivity"
          : err instanceof Error
            ? err.message
            : "Network error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Health-check variant of `testServiceConnection` that reads the stored
 * URL + credentials for the given instance from the config store, rather
 * than taking them from a form. Used by `useServiceHealth` to power the
 * tri-state dots on dashboards/services/settings — same per-service auth
 * probes as the Test Connection button, so the green/orange/red verdicts
 * stay consistent between the two surfaces.
 */
export async function checkInstanceHealth(
  serviceId: ServiceId,
  instanceId: string,
): Promise<ConnectionTestResult> {
  const store = useConfigStore.getState();
  const inst = store.getInstance(serviceId, instanceId);
  if (!inst) {
    return { kind: "unreachable", message: "Instance not found" };
  }
  const url = store.getActiveUrl(serviceId, instanceId);
  if (!url) {
    return { kind: "unreachable", message: "No URL configured" };
  }
  // A LAN URL can't be reached off WiFi — short-circuit instead of probing it.
  // This is the core of the Glances/#106 fix: without it the doomed connect
  // hangs and stalls every other probe in the batch.
  if (lanUnreachableOffWifi(url, inst)) {
    return {
      kind: "unreachable",
      message: `Private LAN address not reachable off Wi-Fi (${lanGuardReason()})`,
    };
  }
  const secrets = store.instanceSecrets[instanceId] ?? {};
  return testServiceConnection(serviceId, {
    url,
    apiKey: secrets.apiKey,
    username: secrets.username,
    password: secrets.password,
    customHeaders: secrets.customHeaders,
    instanceId,
  });
}

type ProbeOutcome =
  | { kind: "ok" }
  | { kind: "auth_failed"; message: string }
  | { kind: "unreachable"; message: string };

/**
 * Turn a 401 into an auth_failed outcome that names the real problem instead of
 * always blaming the password (#352). A Digest challenge we can compute has
 * already been answered and retried by fetchWithDigestRetry before this runs,
 * so anything arriving here is unanswerable, unsupported, or a genuine
 * credential rejection.
 */
function classifyUnauthorized(
  res: Response,
  username: string,
  password: string,
): ProbeOutcome {
  // One parse feeding both views: the header is walked once per 401 instead
  // of once for the Digest challenge and again for the scheme list.
  const challenges = parseAuthChallenges(res.headers.get("www-authenticate") ?? "");
  const digest = parseDigestChallenge(challenges);
  const schemes = listAuthSchemes(challenges);

  // Only complain about an unanswerable Digest challenge when Digest was the
  // server's only offer. A server advertising Basic alongside it already got a
  // Basic attempt from us, so a 401 means the credentials are what failed.
  if (
    digest?.unsupported &&
    !schemes.some((scheme) => scheme.toLowerCase() === "basic")
  ) {
    return {
      kind: "auth_failed",
      message: `Server requires a Digest variant Dashboarr cannot answer: ${digest.unsupported}`,
    };
  }
  if (
    schemes.length > 0 &&
    !schemes.some((scheme) => ["basic", "digest"].includes(scheme.toLowerCase()))
  ) {
    return {
      kind: "auth_failed",
      message: `Server requires ${schemes.join(" or ")} authentication, but Dashboarr only supports HTTP Basic and Digest authentication`,
    };
  }
  // With both fields empty there is no password to be wrong: the server is
  // simply asking for one.
  return {
    kind: "auth_failed",
    message:
      username || password
        ? "Wrong username or password"
        : "Server requires credentials",
  };
}

async function runConnectionProbe(
  serviceId: ServiceId,
  baseUrl: string,
  input: ConnectionTestInput,
  customHeaders: Record<string, string>,
  signal: AbortSignal,
): Promise<ProbeOutcome> {
  const defaults = SERVICE_DEFAULTS[serviceId];
  const apiKey = input.apiKey ?? "";
  const username = input.username ?? "";
  const password = input.password ?? "";

  const makeHeaders = (extra?: Record<string, string>): Headers => {
    const h = new Headers();
    for (const [k, v] of Object.entries(customHeaders)) h.set(k, v);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) h.set(k, v);
    }
    return h;
  };

  switch (serviceId) {
    case "qbittorrent": {
      // Cookie-session auth. Older qBittorrent replies 200 with body "Ok." on
      // success and "Fails." on bad creds; qBittorrent 5.2.0+ replies 204 No
      // Content (empty body) on success — changelog "WEBAPI: Send 204 when
      // WebAPI response contains no data". Accept either success shape.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "/auth/login");
      const headers = makeHeaders({
        "Content-Type": "application/x-www-form-urlencoded",
      });
      const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const res = await fetch(url, { method: "POST", headers, body, signal });
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Wrong username or password" };
      if (res.status === 204) return { kind: "ok" };
      if (!res.ok)
        return { kind: "unreachable", message: `Unexpected status ${res.status}` };
      const text = (await res.text()).trim();
      if (text === "Ok.") return { kind: "ok" };
      return { kind: "auth_failed", message: "Wrong username or password" };
    }

    case "sabnzbd": {
      // Bad key returns HTTP 200 with `{ "error": "API Key Incorrect" }`.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "", {
        mode: "version",
        apikey: apiKey,
        output: "json",
      });
      const res = await fetch(url, { method: "GET", headers: makeHeaders(), signal });
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid API key" };
      if (!res.ok)
        return { kind: "unreachable", message: `Unexpected status ${res.status}` };
      try {
        const json = (await res.json()) as Record<string, unknown> | null;
        if (json && typeof json.error === "string") {
          return { kind: "auth_failed", message: json.error };
        }
        if (json && typeof json.version === "string") return { kind: "ok" };
        return { kind: "unreachable", message: "Unexpected SABnzbd response" };
      } catch {
        return { kind: "unreachable", message: "Invalid JSON response" };
      }
    }

    case "nzbget": {
      // JSON-RPC POST with Basic auth. Bad creds → 401.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "");
      const extra: Record<string, string> = { "Content-Type": "application/json" };
      const basic = basicAuthHeader(username, password);
      if (basic) extra["Authorization"] = basic;
      const res = await fetchWithDigestRetry(
        url,
        {
          method: "POST",
          body: JSON.stringify({ version: "1.1", method: "version", params: [] }),
          signal,
        },
        makeHeaders(extra),
        username,
        password,
        digestSessionKey(input.instanceId, baseUrl),
      );
      if (res.status === 401) return classifyUnauthorized(res, username, password);
      if (res.status === 403)
        return { kind: "auth_failed", message: "Wrong username or password" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (!res.ok)
        return { kind: "unreachable", message: `Unexpected status ${res.status}` };
      try {
        const json = (await res.json()) as Record<string, unknown> | null;
        if (json && "result" in json) return { kind: "ok" };
        return { kind: "unreachable", message: "Unexpected JSON-RPC response" };
      } catch {
        return { kind: "unreachable", message: "Invalid JSON response" };
      }
    }

    case "tautulli": {
      // Tautulli returns 200 with `{response:{result:"error",message:...}}` for
      // bad keys. Use cmd=get_server_friendly_name as a cheap authenticated probe.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "", {
        apikey: apiKey,
        cmd: "get_server_friendly_name",
      });
      const res = await fetch(url, { method: "GET", headers: makeHeaders(), signal });
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid API key" };
      if (!res.ok)
        return { kind: "unreachable", message: `Unexpected status ${res.status}` };
      try {
        const json = (await res.json()) as { response?: { result?: string; message?: string } } | null;
        const response = json?.response;
        if (response?.result === "success") return { kind: "ok" };
        if (response?.result === "error") {
          return {
            kind: "auth_failed",
            message:
              typeof response.message === "string" && response.message.length > 0
                ? response.message
                : "Invalid API key",
          };
        }
        return { kind: "unreachable", message: "Unexpected Tautulli response" };
      } catch {
        return { kind: "unreachable", message: "Invalid JSON response" };
      }
    }

    case "plex": {
      // /library/sections requires X-Plex-Token; bad token → 401.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "/library/sections");
      const headers = makeHeaders({ Accept: "application/json" });
      if (apiKey) headers.set("X-Plex-Token", apiKey);
      const res = await fetch(url, { method: "GET", headers, signal });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid Plex token" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "emby":
    case "jellyfin": {
      // Emby and Jellyfin share this probe. /System/Info validates auth without
      // needing a user-bound token — /Users/Me returns 400 for server-wide API
      // keys because they lack a user context. /System/Info accepts both API
      // keys and user tokens, so it matches every auth shape this app supports.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "/System/Info");
      const headers = makeHeaders();
      if (apiKey) headers.set("X-Emby-Token", apiKey);
      const res = await fetch(url, { method: "GET", headers, signal });
      if (res.status === 401 || res.status === 403)
        return {
          kind: "auth_failed",
          message: `Invalid ${serviceId === "emby" ? "Emby" : "Jellyfin"} token`,
        };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "overseerr": {
      // /auth/me returns the API key's user; 403 for bad key.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "/auth/me");
      const headers = makeHeaders({ Accept: "application/json" });
      if (apiKey) headers.set("X-Api-Key", apiKey);
      const res = await fetch(url, { method: "GET", headers, signal });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid API key" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "glances": {
      // Glances may or may not require auth depending on server config. If the
      // user provided creds and the server still rejects, that's auth failure.
      // If the user provided no creds and the server demands them, surface a
      // more helpful "server requires credentials" message instead.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);
      const extra: Record<string, string> = {};
      const basic = basicAuthHeader(username, password);
      if (basic) extra["Authorization"] = basic;
      const res = await fetchWithDigestRetry(
        url,
        { method: "GET", signal },
        makeHeaders(extra),
        username,
        password,
        digestSessionKey(input.instanceId, baseUrl),
      );
      if (res.status === 401 || res.status === 403) {
        return classifyUnauthorized(res, username, password);
      }
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "tracearr": {
      // Tracearr's /health endpoint requires the Bearer token, so it doubles
      // as an auth probe: 401/403 → bad key, 2xx → reachable + authenticated.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);
      const headers = makeHeaders({ Accept: "application/json" });
      if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
      const res = await fetch(url, { method: "GET", headers, signal });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid API key" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "jellystat": {
      // JellyStat's authenticate middleware guards /stats: a missing/empty key
      // → 401, a wrong key → 403, and (notably) 404 when the server has no API
      // keys configured at all. getLibraryOverview is a cheap authenticated GET
      // that exercises all of these, so it doubles as the auth probe.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);
      const headers = makeHeaders({ Accept: "application/json" });
      if (apiKey) headers.set("x-api-token", apiKey);
      const res = await fetch(url, { method: "GET", headers, signal });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid or missing API key" };
      if (res.status === 404)
        return {
          kind: "auth_failed",
          message: "No API keys configured in JellyStat — create one in its Settings",
        };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "rtorrent": {
      // rtorrent has no GET endpoint — POST a tiny XML-RPC system.listMethods
      // to the /RPC2 mount. Basic and Digest are both answered, so a 401 that
      // survives the retry gets its challenge inspected before deciding whether
      // credentials or the server's auth scheme need attention. A well-formed
      // <methodResponse> (even a <fault>) means we reached an XML-RPC endpoint
      // and authenticated; an HTML body (e.g. the ruTorrent UI) means the URL
      // points somewhere else.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);
      const extra: Record<string, string> = { "Content-Type": "text/xml" };
      // basicAuthHeader sends if EITHER field is set (a token-in-password /
      // empty-username setup is valid). A Digest server rejects Basic, and
      // fetchWithDigestRetry answers the challenge.
      const basic = basicAuthHeader(username, password);
      if (basic) extra["Authorization"] = basic;
      const res = await fetchWithDigestRetry(
        url,
        {
          method: "POST",
          body: '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params></params></methodCall>',
          signal,
        },
        makeHeaders(extra),
        username,
        password,
        digestSessionKey(input.instanceId, baseUrl),
      );
      if (res.status === 401)
        return classifyUnauthorized(res, username, password);
      if (res.status === 403) {
        return {
          kind: "auth_failed",
          message:
            "RPC access forbidden — check /RPC2 server or reverse-proxy access rules",
        };
      }
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (!res.ok)
        return { kind: "unreachable", message: `Unexpected status ${res.status}` };
      const text = await res.text();
      if (text.includes("<methodResponse")) return { kind: "ok" };
      return {
        kind: "unreachable",
        message: "Not an XML-RPC endpoint — check the URL points at /RPC2",
      };
    }

    case "transmission": {
      // Transmission has no GET endpoint — POST a tiny session-get to
      // /transmission/rpc. HTTP Basic auth (if configured) is checked BEFORE
      // the CSRF layer, so a wrong password → 401/403. A correct (or absent)
      // credential with no CSRF token → 409 carrying X-Transmission-Session-Id,
      // which both proves we reached Transmission AND that auth passed. A rare
      // 200 with result:"success" (server not enforcing CSRF) is also ok.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);
      const extra: Record<string, string> = { "Content-Type": "application/json" };
      const basic = basicAuthHeader(username, password);
      if (basic) extra["Authorization"] = basic;
      const res = await fetchWithDigestRetry(
        url,
        {
          method: "POST",
          body: JSON.stringify({ method: "session-get" }),
          signal,
        },
        makeHeaders(extra),
        username,
        password,
        digestSessionKey(input.instanceId, baseUrl),
      );
      if (res.status === 401) return classifyUnauthorized(res, username, password);
      if (res.status === 403)
        return { kind: "auth_failed", message: "Wrong username or password" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.status === 409 && res.headers.get("x-transmission-session-id"))
        return { kind: "ok" };
      if (res.ok) {
        try {
          const json = (await res.json()) as { result?: string } | null;
          if (json?.result === "success") return { kind: "ok" };
        } catch {
          // fall through
        }
      }
      return {
        kind: "unreachable",
        message: "Not a Transmission RPC endpoint — check the URL points at /transmission/rpc",
      };
    }

    case "radarr":
    case "sonarr":
    case "lidarr":
    case "prowlarr":
    case "bazarr": {
      // *arr family: /system/status returns 200 with X-Api-Key, 401 without.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);
      const headers = makeHeaders({ Accept: "application/json" });
      if (apiKey) headers.set("X-Api-Key", apiKey);
      const res = await fetch(url, { method: "GET", headers, signal });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid API key" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) {
        // A 200 that isn't JSON is almost always an auth-proxy login page
        // standing in for the API (issue #239). Reporting "ok" here would light
        // the health dot green and pass Test Connection, then crash the data
        // screen — so flag the proxy instead.
        const ct = res.headers.get("content-type");
        if (ct?.toLowerCase().includes("application/json")) return { kind: "ok" };
        return {
          kind: "unreachable",
          message:
            "Got an HTML page instead of the API. The service may be behind an auth proxy (Authentik/Authelia) — exclude its API path from the proxy.",
        };
      }
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "jackett": {
      // Jackett's apikey is a query param, and only the results/Torznab routes
      // validate it (the admin REST API wants the admin-password cookie). The
      // Torznab meta endpoint t=indexers is the cheapest authenticated GET —
      // it lists configured indexers without querying any tracker. Bad key →
      // 401; a 200 HTML body means an auth proxy (or the Jackett UI) answered
      // instead of the Torznab endpoint.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath, {
        t: "indexers",
        configured: "true",
        apikey: apiKey,
      });
      const res = await fetch(url, { method: "GET", headers: makeHeaders(), signal });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid API key" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (!res.ok)
        return { kind: "unreachable", message: `Unexpected status ${res.status}` };
      const text = await res.text();
      if (text.includes("<indexers")) return { kind: "ok" };
      // Jackett reports a bad apikey as a Torznab <error> document on some
      // versions instead of a 401 — surface that as an auth failure.
      if (text.includes("<error"))
        return { kind: "auth_failed", message: "Invalid API key" };
      return {
        kind: "unreachable",
        message:
          "Got an HTML page instead of the Torznab API. The service may be behind an auth proxy (Authentik/Authelia) — exclude /api from the proxy.",
      };
    }

    case "unraid": {
      // unRAID's official API is GraphQL-only: POST /graphql with X-Api-Key.
      // Probe with a real authenticated query (array state) so a wrong or
      // permission-less key is distinguished from an unreachable server.
      // GraphQL auth failures can arrive EITHER as HTTP 401/403 OR as HTTP 200
      // with an errors[] array (extensions.code UNAUTHENTICATED / FORBIDDEN) —
      // handle both.
      const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);
      const headers = makeHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      if (apiKey) headers.set("X-Api-Key", apiKey);
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: "query Probe { array { state } }" }),
        signal,
      });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid API key" };
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (!res.ok)
        return { kind: "unreachable", message: `Unexpected status ${res.status}` };
      const ct = res.headers.get("content-type");
      if (!ct?.toLowerCase().includes("application/json"))
        return {
          kind: "unreachable",
          message:
            "Got an HTML page instead of the API. The service may be behind an auth proxy (Authentik/Authelia) — exclude /graphql from the proxy.",
        };
      try {
        const json = (await res.json()) as {
          data?: { array?: { state?: string } };
          errors?: Array<{ message?: string; extensions?: { code?: string } }>;
        } | null;
        if (json?.data?.array?.state) return { kind: "ok" };
        const err = json?.errors?.[0];
        if (json?.errors?.length) {
          // errors-without-data has two realistic causes: a bad key
          // (UNAUTHENTICATED) or a key missing the Array read scope
          // (FORBIDDEN) — both are fixed in unRAID's API key settings.
          return {
            kind: "auth_failed",
            message:
              err?.extensions?.code === "FORBIDDEN"
                ? "API key lacks permission to read the array — grant it in unRAID's API key settings"
                : err?.message || "Invalid API key",
          };
        }
        return { kind: "unreachable", message: "Unexpected GraphQL response" };
      } catch {
        return { kind: "unreachable", message: "Invalid JSON response" };
      }
    }

    default: {
      // Exhaustiveness check — a new ServiceId without a probe case fails here.
      const _exhaustive: never = serviceId;
      return {
        kind: "unreachable",
        message: `Unsupported service: ${String(_exhaustive)}`,
      };
    }
  }
}

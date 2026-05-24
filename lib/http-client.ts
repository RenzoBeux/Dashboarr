import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { buildUrl } from "@/lib/url-builder";
import { getDemoResponse } from "@/lib/demo-data";

export { buildUrl };

const DEFAULT_TIMEOUT = 15000;

interface RequestOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  params?: Record<string, string | number | boolean>;
  // Target a specific service instance. When omitted, the active instance for
  // the kind is used (legacy single-instance behavior). Step 3 threads this
  // explicitly from the hooks layer so multi-instance setups can route each
  // request to the right server.
  instanceId?: string;
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

export async function serviceRequest<T>(
  serviceId: ServiceId,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, params, instanceId, ...fetchOptions } = options;
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    // NZBGet dispatches off the JSON-RPC method name in the request body, not
    // the path or query params — pass body through so the demo router can read
    // it. Other services ignore the third arg.
    const body = typeof fetchOptions.body === "string" ? fetchOptions.body : undefined;
    return (getDemoResponse(serviceId, path, params, body) ?? undefined) as T;
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

  // SABnzbd auth lives in the query string (?apikey=…&output=json), not
  // headers. Merge defaults into the caller-supplied params so service
  // modules don't have to know about either of those parameters.
  const finalParams =
    serviceId === "sabnzbd"
      ? { ...(params ?? {}), apikey: secrets.apiKey ?? "", output: "json" }
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
  } else if (serviceId === "sabnzbd") {
    // apikey is injected as a query param above — no header needed
  } else if (serviceId === "glances") {
    if (secrets.username && secrets.password) {
      const encoded = btoa(`${secrets.username}:${secrets.password}`);
      headers.set("Authorization", `Basic ${encoded}`);
    }
  } else if (serviceId === "nzbget") {
    // NZBGet uses HTTP Basic Auth with the Control username/password from
    // nzbget.conf. Every method call is JSON-RPC over POST, so default the
    // content type here and let services/nzbget-api.ts pass the JSON body.
    if (secrets.username && secrets.password) {
      const encoded = btoa(`${secrets.username}:${secrets.password}`);
      headers.set("Authorization", `Basic ${encoded}`);
    }
    headers.set("Content-Type", "application/json");
  } else if (serviceId === "plex") {
    if (secrets.apiKey) {
      headers.set("X-Plex-Token", secrets.apiKey);
      headers.set("Accept", "application/json");
    }
  } else if (serviceId === "jellyfin") {
    if (secrets.apiKey) {
      headers.set("X-Emby-Token", secrets.apiKey);
    }
  } else {
    // Radarr, Sonarr, Overseerr, Tautulli, Prowlarr use X-Api-Key
    if (secrets.apiKey) {
      headers.set("X-Api-Key", secrets.apiKey);
    }
  }

  if (!headers.has("Content-Type") && fetchOptions.body) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      // The body stream can only be read once — clone before trying JSON so
      // we can fall back to text() if the response isn't JSON.
      const clone = response.clone();
      const errorBody = await response
        .json()
        .catch(() => clone.text().catch(() => undefined));
      throw new HttpError(response.status, response.statusText, url, errorBody);
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  } finally {
    clearTimeout(timeoutId);
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

  // SAB has no /system endpoint to GET — it advertises version through the
  // single /api?mode=version handler, so we synthesize the ping URL from the
  // mode + apikey params.
  const pingParams =
    serviceId === "sabnzbd"
      ? { mode: "version", apikey: secrets.apiKey ?? "", output: "json" }
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
  } else if (serviceId === "jellyfin") {
    if (secrets.apiKey) headers.set("X-Emby-Token", secrets.apiKey);
  } else if (serviceId === "glances") {
    if (secrets.username && secrets.password) {
      const encoded = btoa(`${secrets.username}:${secrets.password}`);
      headers.set("Authorization", `Basic ${encoded}`);
    }
  } else if (serviceId === "nzbget") {
    if (secrets.username && secrets.password) {
      const encoded = btoa(`${secrets.username}:${secrets.password}`);
      headers.set("Authorization", `Basic ${encoded}`);
    }
    headers.set("Content-Type", "application/json");
  } else if (serviceId === "sabnzbd") {
    // apikey already in query params
  } else if (serviceId !== "qbittorrent") {
    if (secrets.apiKey) headers.set("X-Api-Key", secrets.apiKey);
  }

  if (useConfigStore.getState().demoMode) return 45;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    // NZBGet's ping is a JSON-RPC `version` POST, not a GET — every NZBGet
    // method (including version) lives at /jsonrpc and rejects GET.
    const isNzbget = serviceId === "nzbget";
    const response = await fetch(url, {
      method: isNzbget ? "POST" : "GET",
      body: isNzbget
        ? JSON.stringify({ version: "1.1", method: "version", params: [] })
        : undefined,
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
    if (
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError")
    ) {
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
  const secrets = store.instanceSecrets[instanceId] ?? {};
  return testServiceConnection(serviceId, {
    url,
    apiKey: secrets.apiKey,
    username: secrets.username,
    password: secrets.password,
    customHeaders: secrets.customHeaders,
  });
}

type ProbeOutcome =
  | { kind: "ok" }
  | { kind: "auth_failed"; message: string }
  | { kind: "unreachable"; message: string };

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
      // Cookie-session auth — body "Ok." = success, anything else = bad creds.
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
      if (username || password) {
        extra["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: makeHeaders(extra),
        body: JSON.stringify({ version: "1.1", method: "version", params: [] }),
        signal,
      });
      if (res.status === 401 || res.status === 403)
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

    case "jellyfin": {
      // /System/Info validates auth without needing a user-bound token —
      // /Users/Me returns 400 for server-wide API keys because they lack a
      // user context. /System/Info accepts both API keys and user tokens, so
      // it matches every Jellyfin auth shape this app supports.
      const url = buildUrl(baseUrl, defaults.apiBasePath, "/System/Info");
      const headers = makeHeaders();
      if (apiKey) headers.set("X-Emby-Token", apiKey);
      const res = await fetch(url, { method: "GET", headers, signal });
      if (res.status === 401 || res.status === 403)
        return { kind: "auth_failed", message: "Invalid Jellyfin token" };
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
      if (username || password) {
        extra["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
      }
      const res = await fetch(url, { method: "GET", headers: makeHeaders(extra), signal });
      if (res.status === 401 || res.status === 403) {
        return {
          kind: "auth_failed",
          message:
            username || password
              ? "Wrong username or password"
              : "Server requires credentials",
        };
      }
      if (res.status >= 500)
        return { kind: "unreachable", message: `Server error ${res.status}` };
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
    }

    case "radarr":
    case "sonarr":
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
      if (res.ok) return { kind: "ok" };
      return { kind: "unreachable", message: `Unexpected status ${res.status}` };
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

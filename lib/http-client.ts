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

export async function serviceRequest<T>(
  serviceId: ServiceId,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, params, instanceId, ...fetchOptions } = options;
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoResponse(serviceId, path, params) ?? undefined) as T;
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
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeoutId);
    // Any HTTP response (even 4xx) means the service is reachable
    return response.status < 500 ? Date.now() - start : null;
  } catch {
    return null;
  }
}

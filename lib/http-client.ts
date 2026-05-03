import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";

const DEFAULT_TIMEOUT = 15000;

interface RequestOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  params?: Record<string, string | number | boolean>;
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
  constructor(
    public status: number,
    public statusText: string,
    public url: string,
  ) {
    const safe = redactUrl(url);
    super(`HTTP ${status} ${statusText} — ${safe}`);
    this.url = safe;
    this.name = "HttpError";
  }
}

function buildUrl(
  baseUrl: string,
  apiBasePath: string,
  path: string,
  params?: Record<string, string | number | boolean>,
): string {
  const url = new URL(`${apiBasePath}${path}`, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function serviceRequest<T>(
  serviceId: ServiceId,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, params, ...fetchOptions } = options;
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoResponse(serviceId, path) ?? undefined) as T;
  }

  const config = store.services[serviceId];
  const secrets = store.secrets[serviceId];
  const defaults = SERVICE_DEFAULTS[serviceId];

  if (!config.enabled) {
    throw new Error(`Service ${serviceId} is not enabled`);
  }

  const baseUrl = store.getActiveUrl(serviceId);
  if (!baseUrl) {
    throw new Error(`No URL configured for ${serviceId}`);
  }

  const url = buildUrl(baseUrl, defaults.apiBasePath, path, params);

  // Inject auth headers based on service type
  const headers = new Headers(fetchOptions.headers);

  if (serviceId === "qbittorrent") {
    // qBittorrent uses cookie-based auth — handled by the cookie jar
    // The login function must be called first to establish the session
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
  } else {
    // Radarr, Sonarr, Seerr, Tautulli, Prowlarr use X-Api-Key
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
      throw new HttpError(response.status, response.statusText, url);
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
 */
export async function pingService(serviceId: ServiceId, urlOverride?: string): Promise<number | null> {
  const store = useConfigStore.getState();
  const config = store.services[serviceId];
  const secrets = store.secrets[serviceId];
  const defaults = SERVICE_DEFAULTS[serviceId];

  const baseUrl = urlOverride ?? store.getActiveUrl(serviceId);
  if (!baseUrl) return null;

  const url = buildUrl(baseUrl, defaults.apiBasePath, defaults.pingPath);

  const headers = new Headers();
  if (serviceId === "plex") {
    if (secrets.apiKey) headers.set("X-Plex-Token", secrets.apiKey);
    headers.set("Accept", "application/json");
  } else if (serviceId === "glances") {
    if (secrets.username && secrets.password) {
      const encoded = btoa(`${secrets.username}:${secrets.password}`);
      headers.set("Authorization", `Basic ${encoded}`);
    }
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

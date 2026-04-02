import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";

const DEFAULT_TIMEOUT = 15000;

interface RequestOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  params?: Record<string, string | number | boolean>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public url: string,
  ) {
    super(`HTTP ${status} ${statusText} — ${url}`);
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
  } else if (serviceId === "plex") {
    if (secrets.apiKey) {
      headers.set("X-Plex-Token", secrets.apiKey);
      headers.set("Accept", "application/json");
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
 */
export async function pingService(serviceId: ServiceId): Promise<number | null> {
  const store = useConfigStore.getState();
  const config = store.services[serviceId];

  if (!config.enabled) return null;

  const baseUrl = store.getActiveUrl(serviceId);
  if (!baseUrl) return null;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(baseUrl, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeoutId);
    return Date.now() - start;
  } catch {
    return null;
  }
}

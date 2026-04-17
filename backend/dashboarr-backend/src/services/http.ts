import type { StoredServiceConfig } from "../db/repos/config.js";
import { getEnv } from "../env.js";
import { SERVICE_API_BASE, SERVICE_PING_PATH } from "../types.js";
import type { ServiceId } from "../types.js";

const DEFAULT_TIMEOUT = 15000;
const PING_TIMEOUT = 5000;

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  params?: Record<string, string | number | boolean>;
}

export class ServiceHttpError extends Error {
  constructor(
    public readonly serviceId: ServiceId,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`${serviceId} HTTP ${status} — ${url}`);
    this.name = "ServiceHttpError";
  }
}

export function activeBaseUrl(config: StoredServiceConfig): string {
  // The app pushes its own `useRemote` based on the phone's WiFi state, but the
  // backend is a separate network citizen — usually on the LAN next to the
  // services — so we ignore the app flag and route via BACKEND_USE_REMOTE.
  return getEnv().BACKEND_USE_REMOTE ? config.remoteUrl : config.localUrl;
}

function buildUrl(
  baseUrl: string,
  apiBase: string,
  path: string,
  params?: Record<string, string | number | boolean>,
): string {
  const url = new URL(`${apiBase}${path}`, baseUrl);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function applyAuth(headers: Headers, config: StoredServiceConfig): void {
  const { id } = config;
  if (id === "qbittorrent") {
    // cookie-based — qbittorrent.ts handles it
    return;
  }
  if (id === "glances") {
    if (config.username && config.password) {
      const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
      headers.set("Authorization", `Basic ${encoded}`);
    }
    return;
  }
  if (id === "plex") {
    if (config.apiKey) {
      headers.set("X-Plex-Token", config.apiKey);
      headers.set("Accept", "application/json");
    }
    return;
  }
  if (config.apiKey) {
    headers.set("X-Api-Key", config.apiKey);
  }
}

export async function serviceFetch<T>(
  config: StoredServiceConfig,
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const baseUrl = activeBaseUrl(config);
  if (!baseUrl) throw new Error(`No URL configured for ${config.id}`);
  const apiBase = SERVICE_API_BASE[config.id];
  const url = buildUrl(baseUrl, apiBase, path, options.params);

  const headers = new Headers(options.headers);
  applyAuth(headers, config);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);

  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ServiceHttpError(config.id, res.status, url);
    }
    const ct = res.headers.get("content-type");
    if (ct?.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Lightweight reachability check — any <500 response means the service is alive.
 */
export async function pingService(config: StoredServiceConfig): Promise<boolean> {
  const baseUrl = activeBaseUrl(config);
  if (!baseUrl) return false;

  const apiBase = SERVICE_API_BASE[config.id];
  const url = buildUrl(baseUrl, apiBase, SERVICE_PING_PATH[config.id]);
  const headers = new Headers();
  applyAuth(headers, config);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

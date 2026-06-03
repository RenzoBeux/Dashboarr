import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { buildUrl } from "@/lib/http-client";
import { getDemoJellystatResponse } from "@/lib/demo-data";
import type {
  JellyfinSession,
  JellystatActiveUser,
  JellystatActivityRow,
  JellystatPaginated,
  JellystatViewsResponse,
} from "@/lib/types";

/**
 * JellyStat is a Jellyfin statistics server (analogous to Tautulli for Plex).
 * Its REST API lives at the server root (/stats, /api, /proxy) and authenticates
 * with an `x-api-token` header. Per-instance routing follows the usual rule:
 * pass `instanceId` to target a specific JellyStat, omit to use the active one.
 *
 * Endpoints mix GET (query params) with POST (JSON body), so the helper takes
 * both. The auth header is sent on every call; the /proxy/* routes ignore it
 * (they're unauthenticated on the server) but including it is harmless.
 */
interface JellystatRequestOptions {
  method?: "GET" | "POST";
  params?: Record<string, string | number | boolean>;
  body?: unknown;
}

async function jellystatRequest<T>(
  path: string,
  options: JellystatRequestOptions = {},
  instanceId?: string,
): Promise<T> {
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoJellystatResponse(path) ?? undefined) as T;
  }

  const targetId = instanceId ?? store.getActiveInstanceId("jellystat");
  if (!targetId) throw new Error("No JellyStat instance configured");
  const inst = store.getInstance("jellystat", targetId);
  if (!inst) throw new Error(`JellyStat instance ${targetId} not found`);
  if (!inst.enabled) throw new Error("JellyStat is not enabled");

  const secrets = store.instanceSecrets[targetId] ?? {};
  const baseUrl = store.getActiveUrl("jellystat", targetId);
  if (!baseUrl) throw new Error("No URL configured for JellyStat");

  const { method = "GET", params, body } = options;
  const url = buildUrl(baseUrl, SERVICE_DEFAULTS.jellystat.apiBasePath, path, params);

  // Custom (global + per-instance) headers first so service auth wins on
  // collision — mirrors serviceRequest's ordering.
  const headers = new Headers();
  const customHeaders = store.getMergedHeaders("jellystat", targetId);
  for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);
  if (secrets.apiKey) headers.set("x-api-token", secrets.apiKey);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`JellyStat HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Live now-playing ---

// /proxy/getSessions passes the raw Jellyfin Sessions payload through unchanged,
// so the result is standard Jellyfin SessionInfo[]. Drop idle clients (no
// NowPlayingItem) to match the Jellyfin service's getSessions behavior.
export async function getSessions(instanceId?: string): Promise<JellyfinSession[]> {
  const data = await jellystatRequest<JellyfinSession[]>("/proxy/getSessions", {}, instanceId);
  return (data ?? []).filter((s) => s.NowPlayingItem);
}

// --- Watch history ---

// Flat, one-row-per-session activity, newest first (sorted by ActivityDateInserted
// desc on the server). The grouped /api/getHistory collapses repeat plays; the
// Activity tab wants individual events, so we use the flat endpoint.
export async function getPlaybackActivity(
  size = 30,
  page = 1,
  instanceId?: string,
): Promise<JellystatActivityRow[]> {
  const data = await jellystatRequest<JellystatPaginated<JellystatActivityRow>>(
    "/stats/getPlaybackActivity",
    { params: { size, page, desc: true } },
    instanceId,
  );
  return data?.results ?? [];
}

// --- Charts ---

// getViewsOverTime / getViewsByDays / getViewsByHour share the same
// { libraries, stats } envelope and a `days` window param.
export function getViewsOverTime(
  days = 30,
  instanceId?: string,
): Promise<JellystatViewsResponse> {
  return jellystatRequest<JellystatViewsResponse>(
    "/stats/getViewsOverTime",
    { params: { days } },
    instanceId,
  );
}

export function getViewsByDays(
  days = 30,
  instanceId?: string,
): Promise<JellystatViewsResponse> {
  return jellystatRequest<JellystatViewsResponse>(
    "/stats/getViewsByDays",
    { params: { days } },
    instanceId,
  );
}

export function getViewsByHour(
  days = 30,
  instanceId?: string,
): Promise<JellystatViewsResponse> {
  return jellystatRequest<JellystatViewsResponse>(
    "/stats/getViewsByHour",
    { params: { days } },
    instanceId,
  );
}

// --- Most active users (POST with a JSON body) ---

export function getMostActiveUsers(
  days = 30,
  instanceId?: string,
): Promise<JellystatActiveUser[]> {
  return jellystatRequest<JellystatActiveUser[]>(
    "/stats/getMostActiveUsers",
    { method: "POST", body: { days } },
    instanceId,
  );
}

import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { buildUrl } from "@/lib/http-client";
import { getDemoTautulliResponse } from "@/lib/demo-data";
import type {
  TautulliActivity,
  TautulliHistoryResponse,
  TautulliLibraryStats,
} from "@/lib/types";

/**
 * Tautulli uses a different API pattern: all calls go to /api/v2
 * with `apikey` and `cmd` as query params. Per-instance routing follows the
 * usual rule: pass `instanceId` to target a specific Tautulli, omit to use
 * the active one.
 */
async function tautulliRequest<T>(
  cmd: string,
  params: Record<string, string | number> = {},
  instanceId?: string,
): Promise<T> {
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoTautulliResponse(cmd) ?? undefined) as T;
  }

  const targetId = instanceId ?? store.getActiveInstanceId("tautulli");
  if (!targetId) throw new Error("No Tautulli instance configured");
  const inst = store.getInstance("tautulli", targetId);
  if (!inst) throw new Error(`Tautulli instance ${targetId} not found`);
  const secrets = store.instanceSecrets[targetId] ?? {};

  if (!inst.enabled) throw new Error("Tautulli is not enabled");

  const baseUrl = store.getActiveUrl("tautulli", targetId);
  if (!baseUrl) throw new Error("No URL configured for Tautulli");

  const url = new URL(
    buildUrl(baseUrl, SERVICE_DEFAULTS.tautulli.apiBasePath, ""),
  );
  url.searchParams.set("apikey", secrets.apiKey ?? "");
  url.searchParams.set("cmd", cmd);
  url.searchParams.set("out_type", "json");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  // apikey lives in the query string, so custom headers can never collide
  // with auth here — straight pass-through.
  const headers = new Headers();
  const customHeaders = store.getMergedHeaders("tautulli", targetId);
  for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url.toString(), { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`Tautulli HTTP ${response.status}`);
    const json = await response.json();
    return json.response.data as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Activity ---

export function getActivity(instanceId?: string): Promise<TautulliActivity> {
  return tautulliRequest<TautulliActivity>("get_activity", {}, instanceId);
}

// --- History ---

export async function getHistory(
  length = 20,
  start = 0,
  instanceId?: string,
): Promise<{ recordsTotal: number; data: import("@/lib/types").TautulliHistoryItem[] }> {
  const result = await tautulliRequest<{
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    data: import("@/lib/types").TautulliHistoryItem[];
  }>("get_history", { length, start }, instanceId);
  return { recordsTotal: result.recordsTotal, data: result.data };
}

// --- Library Stats ---

export function getLibraryStats(instanceId?: string): Promise<
  {
    section_id: number;
    section_name: string;
    section_type: string;
    count: string;
    parent_count?: string;
    child_count?: string;
  }[]
> {
  return tautulliRequest("get_libraries_table", { length: 50 }, instanceId).then(
    (data: any) => data.data,
  );
}

// --- Server Info ---

export async function getServerIdentity(
  instanceId?: string,
): Promise<{ machine_identifier: string; version: string }> {
  return tautulliRequest("get_server_identity", {}, instanceId);
}

// --- Poster URL helper ---

export function getTautulliImageUrl(
  ratingKey: string | number,
  width = 300,
  height = 450,
  instanceId?: string,
): string {
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId("tautulli");
  if (!targetId) return "";
  const baseUrl = store.getActiveUrl("tautulli", targetId);
  const secrets = store.instanceSecrets[targetId] ?? {};
  return `${baseUrl}/pms_image_proxy?img=/library/metadata/${ratingKey}/thumb&width=${width}&height=${height}&fallback=poster&apikey=${secrets.apiKey}`;
}

// expo-image source with a token-stripped cacheKey so rotating the apikey
// doesn't invalidate every cached poster.
export function getTautulliImageSource(
  ratingKey: string | number,
  width = 300,
  height = 450,
  instanceId?: string,
): { uri: string; cacheKey: string } {
  const uri = getTautulliImageUrl(ratingKey, width, height, instanceId);
  const cacheKey = uri.replace(/[?&]apikey=[^&]*/g, "");
  return { uri, cacheKey };
}

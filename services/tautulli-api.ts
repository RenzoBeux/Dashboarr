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
 * with `apikey` and `cmd` as query params.
 */
async function tautulliRequest<T>(
  cmd: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoTautulliResponse(cmd) ?? undefined) as T;
  }

  const config = store.services.tautulli;
  const secrets = store.secrets.tautulli;

  if (!config.enabled) throw new Error("Tautulli is not enabled");

  const baseUrl = store.getActiveUrl("tautulli");
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error(`Tautulli HTTP ${response.status}`);
    const json = await response.json();
    return json.response.data as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Activity ---

export function getActivity(): Promise<TautulliActivity> {
  return tautulliRequest<TautulliActivity>("get_activity");
}

// --- History ---

export async function getHistory(
  length = 20,
  start = 0,
): Promise<{ recordsTotal: number; data: import("@/lib/types").TautulliHistoryItem[] }> {
  const result = await tautulliRequest<{
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    data: import("@/lib/types").TautulliHistoryItem[];
  }>("get_history", { length, start });
  return { recordsTotal: result.recordsTotal, data: result.data };
}

// --- Library Stats ---

export function getLibraryStats(): Promise<
  {
    section_id: number;
    section_name: string;
    section_type: string;
    count: string;
    parent_count?: string;
    child_count?: string;
  }[]
> {
  return tautulliRequest("get_libraries_table", { length: 50 }).then(
    (data: any) => data.data,
  );
}

// --- Server Info ---

export async function getServerIdentity(): Promise<{ machine_identifier: string; version: string }> {
  return tautulliRequest("get_server_identity");
}

// --- Poster URL helper ---

export function getTautulliImageUrl(
  ratingKey: string | number,
  width = 300,
  height = 450,
): string {
  const store = useConfigStore.getState();
  const baseUrl = store.getActiveUrl("tautulli");
  const secrets = store.secrets.tautulli;
  return `${baseUrl}/pms_image_proxy?img=/library/metadata/${ratingKey}/thumb&width=${width}&height=${height}&fallback=poster&apikey=${secrets.apiKey}`;
}

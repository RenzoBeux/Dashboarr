import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { buildUrl } from "@/lib/http-client";
import { getDemoTautulliResponse } from "@/lib/demo-data";
import type {
  TautulliActivity,
  TautulliHistoryResponse,
  TautulliLibraryStats,
  TautulliSession,
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

// pms_image_proxy fallback placeholders. `poster` is the video poster, `cover`
// is the (square) music album placeholder, `art` is the backdrop. Using the
// wrong one yields a generic placeholder instead of the real image — notably,
// music tracks must use `cover`, not `poster`.
type TautulliFallback = "poster" | "cover" | "art";

// Build a pms_image_proxy URL from a Plex image PATH (e.g. a session's `thumb`
// or `parent_thumb`, like "/library/metadata/123/thumb"). Tautulli re-derives
// the rating_key from the path, so passing the session's own thumb path is the
// robust approach for every media type (mirrors Tautulli's own activity UI).
export function getTautulliImageUrl(
  imgPath: string,
  width = 300,
  height = 450,
  instanceId?: string,
  fallback: TautulliFallback = "poster",
): string {
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId("tautulli");
  if (!targetId) return "";
  const baseUrl = store.getActiveUrl("tautulli", targetId);
  const secrets = store.instanceSecrets[targetId] ?? {};
  return `${baseUrl}/pms_image_proxy?img=${imgPath}&width=${width}&height=${height}&fallback=${fallback}&apikey=${secrets.apiKey}`;
}

// expo-image source with a token-stripped cacheKey so rotating the apikey
// doesn't invalidate every cached poster.
export function getTautulliImageSource(
  imgPath: string,
  width = 300,
  height = 450,
  instanceId?: string,
  fallback: TautulliFallback = "poster",
): { uri: string; cacheKey: string } {
  const uri = getTautulliImageUrl(imgPath, width, height, instanceId, fallback);
  const cacheKey = uri.replace(/[?&]apikey=[^&]*/g, "");
  return { uri, cacheKey };
}

// Pick the right now-playing artwork for a session by media type and return an
// expo-image source. Music tracks resolve to the album (parent) cover with
// `fallback=cover` — a track's own `/thumb` is normally empty in Plex, which is
// why album art came back blank (issue #141). Episodes use the show
// (grandparent) poster; movies use their own thumb. Returns null when the
// source exposes no usable image path.
export function getTautulliSessionPoster(
  session: TautulliSession,
  width = 220,
  height = 330,
  instanceId?: string,
): { uri: string; cacheKey: string } | null {
  const metadataThumb = (ratingKey: string) =>
    ratingKey ? `/library/metadata/${ratingKey}/thumb` : "";

  let imgPath: string;
  let fallback: TautulliFallback;
  if (session.media_type === "track") {
    // Album (parent) cover — the track's own /thumb is normally empty.
    imgPath =
      session.parent_thumb || metadataThumb(session.parent_rating_key) || session.thumb;
    fallback = "cover";
  } else if (session.media_type === "episode") {
    // Show (grandparent) poster.
    imgPath =
      session.grandparent_thumb ||
      metadataThumb(session.grandparent_rating_key) ||
      session.thumb;
    fallback = "poster";
  } else {
    imgPath = session.thumb || metadataThumb(session.rating_key);
    fallback = "poster";
  }
  if (!imgPath) return null;
  return getTautulliImageSource(imgPath, width, height, instanceId, fallback);
}

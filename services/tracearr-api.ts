import { useConfigStore } from "@/store/config-store";
import { serviceRequest } from "@/lib/http-client";
import type { TracearrHistoryResponse, TracearrStreamsResponse } from "@/lib/types";

/**
 * Tracearr's read-only public API is plain REST + JSON with Bearer-token auth,
 * so it rides the generic `serviceRequest` helper (which injects the
 * `Authorization: Bearer trr_pub_<token>` header for this kind). Per-instance
 * routing follows the usual rule: pass `instanceId` to target a specific
 * Tracearr, omit to use the active one.
 */

// GET /streams — active playback sessions with codec/quality details + summary.
export function getStreams(instanceId?: string): Promise<TracearrStreamsResponse> {
  return serviceRequest<TracearrStreamsResponse>("tracearr", "/streams", { instanceId });
}

// GET /history — paginated session history (page is 1-indexed).
export function getHistory(
  page = 1,
  pageSize = 30,
  instanceId?: string,
): Promise<TracearrHistoryResponse> {
  return serviceRequest<TracearrHistoryResponse>("tracearr", "/history", {
    params: { page, pageSize },
    instanceId,
  });
}

/**
 * Resolve a Tracearr image to an expo-image source. Tracearr's `posterUrl` /
 * `avatarUrl` are RELATIVE proxy paths (/api/v1/images/proxy?...) served WITHOUT
 * auth, so we just prefix the instance base URL. No token to strip, so the
 * cacheKey is the URL itself. Returns null when there's no image or no URL.
 */
export function getTracearrImageSource(
  relativePath: string | null | undefined,
  instanceId?: string,
): { uri: string; cacheKey: string } | null {
  if (!relativePath) return null;
  // Already absolute (defensive) — pass through.
  if (/^https?:\/\//i.test(relativePath)) {
    return { uri: relativePath, cacheKey: relativePath };
  }
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId("tracearr");
  if (!targetId) return null;
  const baseUrl = store.getActiveUrl("tracearr", targetId);
  if (!baseUrl) return null;
  const uri = `${baseUrl.replace(/\/$/, "")}${relativePath}`;
  return { uri, cacheKey: uri };
}

import { useConfigStore } from "@/store/config-store";
import { serviceRequest } from "@/lib/http-client";
import { getMediaServerConfig, type MediaServerId } from "@/lib/media-server-config";
import type {
  JellyfinItem,
  JellyfinItemsResponse,
  JellyfinLibrary,
  JellyfinSession,
  JellyfinUser,
} from "@/lib/types";

// Single source of truth for "is this session being transcoded". `PlayMethod`
// is the authoritative signal; `TranscodingInfo` can also be present for
// direct-stream-with-audio-remux cases, so we cross-check the IsXDirect flags
// before treating it as a transcode.
export function isJellyfinTranscoding(session: JellyfinSession): boolean {
  if (session.PlayState?.PlayMethod === "Transcode") return true;
  const info = session.TranscodingInfo;
  if (!info) return false;
  return info.IsVideoDirect === false || info.IsAudioDirect === false;
}

// Per-instance routing: every function takes an optional `instanceId` to scope
// the request to a specific instance. When omitted, the active instance is
// used (legacy single-instance behavior). The trailing `serviceId` selects the
// media server kind — it defaults to "jellyfin" so existing call sites are
// unaffected; Emby call sites pass "emby". Jellyfin and Emby share this entire
// API (see lib/media-server-config.ts), differing only in image sizing params.

// --- Users ---

export async function getCurrentUser(
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): Promise<JellyfinUser> {
  return serviceRequest<JellyfinUser>(serviceId, "/Users/Me", { instanceId });
}

export async function getUsers(
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): Promise<JellyfinUser[]> {
  return serviceRequest<JellyfinUser[]>(serviceId, "/Users", { instanceId });
}

// Resolve the userId associated with the configured API key. Tries the cheap
// `/Users/Me` endpoint first (works with user-scoped keys); falls back to
// scanning `/Users` and picking the first non-disabled administrator. Used by
// the hook layer so user-scoped queries can run without making the user paste
// a userId into the config form.
export async function resolveUserId(
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): Promise<string | null> {
  try {
    const me = await getCurrentUser(instanceId, serviceId);
    if (me?.Id) return me.Id;
  } catch {
    // ignore — fall through to /Users
  }
  try {
    const users = await getUsers(instanceId, serviceId);
    const admin = users.find((u) => u.Policy?.IsAdministrator && !u.Policy?.IsDisabled);
    if (admin) return admin.Id;
    const enabled = users.find((u) => !u.Policy?.IsDisabled);
    return enabled?.Id ?? null;
  } catch {
    return null;
  }
}

// --- Libraries ---

export async function getLibraries(
  userId: string,
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): Promise<JellyfinLibrary[]> {
  const data = await serviceRequest<JellyfinItemsResponse>(
    serviceId,
    `/Users/${encodeURIComponent(userId)}/Views`,
    { instanceId },
  );
  return (data.Items ?? []) as unknown as JellyfinLibrary[];
}

// --- Recently Added ---

export async function getRecentlyAdded(
  userId: string,
  parentId?: string,
  count = 20,
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): Promise<JellyfinItem[]> {
  const params: Record<string, string | number | boolean> = {
    Limit: count,
    Fields: "PrimaryImageAspectRatio,ProductionYear,DateCreated",
  };
  if (parentId) params.ParentId = parentId;
  return serviceRequest<JellyfinItem[]>(
    serviceId,
    `/Users/${encodeURIComponent(userId)}/Items/Latest`,
    { params, instanceId },
  );
}

// --- Resume / Continue Watching ---

export async function getResumeItems(
  userId: string,
  count = 20,
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): Promise<JellyfinItem[]> {
  const data = await serviceRequest<JellyfinItemsResponse>(
    serviceId,
    `/Users/${encodeURIComponent(userId)}/Items/Resume`,
    {
      params: {
        Limit: count,
        MediaTypes: "Video",
        Fields: "PrimaryImageAspectRatio,ProductionYear",
      },
      instanceId,
    },
  );
  return data.Items ?? [];
}

// --- Now Playing (Sessions) ---

export async function getSessions(
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): Promise<JellyfinSession[]> {
  // Server-wide endpoint — returns every connected session, not just the
  // current user's. Filter on the client if/when needed.
  const data = await serviceRequest<JellyfinSession[]>(serviceId, "/Sessions", {
    params: { ActiveWithinSeconds: 960 },
    instanceId,
  });
  // Only keep sessions that are actually playing something; idle clients also
  // show up in /Sessions.
  return (data ?? []).filter((s) => s.NowPlayingItem);
}

// --- Image URL helpers ---

// Build a primary-image URL for a Jellyfin item. Mirrors getPlexImageUrl in
// services/plex-api.ts — token in the query string so plain <Image> tags can
// load the asset without setting custom headers.
export function getJellyfinImageUrl(
  item: Pick<
    JellyfinItem,
    "Id" | "ImageTags" | "SeriesId" | "SeriesPrimaryImageTag" | "ParentBackdropItemId" | "ParentBackdropImageTags" | "ParentThumbItemId" | "ParentThumbImageTag"
  > | null | undefined,
  type: "Primary" | "Backdrop" | "Thumb" = "Primary",
  width = 300,
  height = 450,
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): string | null {
  if (!item) return null;
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId(serviceId);
  if (!targetId) return null;
  const baseUrl = store.getActiveUrl(serviceId, targetId);
  const secrets = store.instanceSecrets[targetId] ?? {};
  if (!baseUrl) return null;
  const trimmed = baseUrl.replace(/\/+$/, "");

  // Pick the best available image source for the requested type. For episodes
  // we fall back to the parent series' primary art so the row doesn't render
  // a black tile when an episode lacks its own thumbnail.
  let itemId = item.Id;
  let tag = item.ImageTags?.[type];

  if (!tag) {
    if (type === "Primary" && item.SeriesId && item.SeriesPrimaryImageTag) {
      itemId = item.SeriesId;
      tag = item.SeriesPrimaryImageTag;
    } else if (type === "Backdrop" && item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0]) {
      itemId = item.ParentBackdropItemId;
      tag = item.ParentBackdropImageTags[0];
    } else if (type === "Thumb" && item.ParentThumbItemId && item.ParentThumbImageTag) {
      itemId = item.ParentThumbItemId;
      tag = item.ParentThumbImageTag;
    } else if (type === "Backdrop" && item.ImageTags?.Backdrop) {
      tag = item.ImageTags.Backdrop;
    }
  }

  if (!tag) return null;

  // Jellyfin and Emby differ here: Jellyfin honors fillWidth/fillHeight, Emby
  // only maxWidth/maxHeight. The per-service config supplies the right pair.
  const params = new URLSearchParams({
    ...getMediaServerConfig(serviceId).imageSizeParams(width, height),
    quality: "90",
    tag,
  });
  if (secrets?.apiKey) params.set("api_key", secrets.apiKey);
  return `${trimmed}/Items/${encodeURIComponent(itemId)}/Images/${type}?${params.toString()}`;
}

// expo-image source with a token-stripped cacheKey so rotating the api_key
// doesn't invalidate every cached poster.
export function getJellyfinImageSource(
  item: Parameters<typeof getJellyfinImageUrl>[0],
  type: "Primary" | "Backdrop" | "Thumb" = "Primary",
  width = 300,
  height = 450,
  instanceId?: string,
  serviceId: MediaServerId = "jellyfin",
): { uri: string; cacheKey: string } | null {
  const uri = getJellyfinImageUrl(item, type, width, height, instanceId, serviceId);
  if (!uri) return null;
  const cacheKey = uri.replace(/[?&]api_key=[^&]*/g, "");
  return { uri, cacheKey };
}

// Convert Jellyfin's "ticks" (100-nanosecond units) to milliseconds.
export function ticksToMs(ticks: number | undefined | null): number {
  if (!ticks || ticks <= 0) return 0;
  return Math.floor(ticks / 10000);
}

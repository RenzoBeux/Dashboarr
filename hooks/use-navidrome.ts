import { useQuery } from "@tanstack/react-query";

import {
  deleteAllMissingFiles,
  getAlbumList,
  getNowPlaying,
  getOverview,
  getPlaylist,
  getPlaylists,
  getScanStatus,
  search3,
  startScan,
} from "@/services/navidrome-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useServiceMutation, useServiceQuery } from "@/hooks/use-service-query";
import { POLLING_INTERVALS } from "@/lib/constants";

// While a scan runs, getScanStatus is the only progress signal we have (there
// is no event stream on the Subsonic API), so the Overview tightens its poll
// from the 30s health cadence to this until `scanning` clears.
const SCANNING_POLL_INTERVAL = 3000;

/**
 * The Overview payload: library counters, admin-ness, and the live scan flag.
 * Polls fast while a scan is running so the badge and counters actually move.
 */
export function useNavidromeOverview(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("navidrome", instanceId);
  return useQuery({
    queryKey: ["navidrome", id, "overview"],
    queryFn: () => getOverview(id ?? undefined),
    enabled: enabled && !!id,
    refetchInterval: (query) =>
      query.state.data?.summary.scanning
        ? SCANNING_POLL_INTERVAL
        : POLLING_INTERVALS.serviceHealth,
  });
}

/**
 * Scan state on its own. Cheaper than the Overview (one ungated Subsonic call)
 * and enough for the dashboard widget's "Scanning" badge.
 */
export function useNavidromeScanStatus(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("navidrome", instanceId);
  return useQuery({
    queryKey: ["navidrome", id, "scanStatus"],
    queryFn: () => getScanStatus(id ?? undefined),
    enabled: enabled && !!id,
    refetchInterval: (query) =>
      query.state.data?.scanning ? SCANNING_POLL_INTERVAL : POLLING_INTERVALS.serviceHealth,
  });
}

/**
 * Live playback. Same 5s cadence as Plex/Jellyfin sessions, and the same
 * ["navidrome", id, "nowPlaying"] key the Combined Now Playing widget uses, so
 * the tab and the widget share one cache entry.
 */
export function useNavidromeNowPlaying(instanceId?: string) {
  return useServiceQuery(
    "navidrome",
    ["nowPlaying"],
    getNowPlaying,
    POLLING_INTERVALS.activeTorrents,
    instanceId,
  );
}

/**
 * Recently-added albums, the Browse tab's default view. Direct useQuery: the
 * list type belongs in the cache key, which useServiceQuery can't express.
 */
export function useNavidromeAlbums(
  type: "newest" | "recent" | "frequent" | "random" | "alphabeticalByName" = "newest",
  size = 24,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("navidrome", instanceId);
  return useQuery({
    queryKey: ["navidrome", id, "albums", type, size],
    queryFn: () => getAlbumList(type, size, 0, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 60000,
  });
}

/**
 * search3 over artists, albums and songs. Callers pass an already-debounced
 * query; a short one is gated off rather than shipped, because Navidrome's
 * search is a prefix autocomplete and a single letter matches most of a library.
 */
export function useNavidromeSearch(query: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("navidrome", instanceId);
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["navidrome", id, "search", trimmed],
    queryFn: () => search3(trimmed, {}, id ?? undefined),
    enabled: enabled && !!id && trimmed.length >= 2,
    staleTime: 30000,
  });
}

export function useNavidromePlaylists(instanceId?: string) {
  return useServiceQuery(
    "navidrome",
    ["playlists"],
    getPlaylists,
    POLLING_INTERVALS.queue,
    instanceId,
  );
}

export function useNavidromePlaylist(playlistId: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("navidrome", instanceId);
  return useQuery({
    queryKey: ["navidrome", id, "playlist", playlistId],
    queryFn: () => getPlaylist(playlistId, id ?? undefined),
    enabled: enabled && !!id && !!playlistId,
    staleTime: 60000,
  });
}

/** Quick (incremental) or full rescan. Admin only; the UI gates on that. */
export function useNavidromeStartScan(instanceId?: string) {
  return useServiceMutation(
    "navidrome",
    (fullScan: boolean, id) => startScan(fullScan, id),
    instanceId,
  );
}

/** Permanently purge every missing track. Destructive; always behind a confirm. */
export function useNavidromeDeleteMissing(instanceId?: string) {
  return useServiceMutation(
    "navidrome",
    (_args: void, id) => deleteAllMissingFiles(id),
    instanceId,
  );
}

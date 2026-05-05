import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  getTransferInfo,
  getTorrents,
  getTorrentFiles,
  getTorrentTrackers,
  pauseTorrents,
  resumeTorrents,
  deleteTorrents,
  addTorrentMagnet,
  setDownloadLimit,
  setUploadLimit,
  getSpeedLimitsMode,
  toggleSpeedLimitsMode,
  getSpeedPreferences,
  setAltSpeedLimits,
} from "@/services/qbittorrent-api";
import type { GetTorrentsOptions, QBTorrentFilter } from "@/services/qbittorrent-api";
import type { QBTorrent } from "@/lib/types";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useQBEnabled() {
  return useConfigStore((s) => s.services.qbittorrent.enabled);
}

export function useTransferInfo() {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "transfer"],
    queryFn: getTransferInfo,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled,
  });
}

// Completion notifications don't need 5s precision — a slower cadence cuts
// per-poll bandwidth proportionally on large libraries.
const NOTIFICATION_WATCHER_INTERVAL_MS = 15000;

/**
 * Watcher-only hook that returns currently-downloading torrents at a slow
 * cadence. Stays disabled (no fetch at all) until `active` flips true, which
 * the notification watcher gates on its own preconditions (notifications
 * enabled, not deferred to backend, etc.).
 */
export function useDownloadingTorrentsForWatcher(active: boolean) {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "torrents", "watcher", "downloading"],
    queryFn: () => getTorrents({ filter: "downloading" }),
    refetchInterval: NOTIFICATION_WATCHER_INTERVAL_MS,
    enabled: enabled && active,
  });
}

/**
 * Bounded torrent fetch with server-side sort/limit/offset/filter. Use this
 * when you only need a slice (e.g. dashboard widget showing the top N).
 */
export function useTorrents(options: GetTorrentsOptions = {}) {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "torrents", "list", options],
    queryFn: () => getTorrents(options),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled,
  });
}

/**
 * Paginated torrent list with server-side sort + filter. Each page fetches
 * `pageSize` torrents at the appropriate offset. The default 5s poll refetches
 * all loaded pages, so prefer modest page sizes on large libraries.
 */
export function useInfiniteTorrents({
  filter,
  sort,
  reverse,
  pageSize = 50,
}: {
  filter?: QBTorrentFilter;
  sort?: keyof QBTorrent;
  reverse?: boolean;
  pageSize?: number;
}) {
  const enabled = useQBEnabled();
  return useInfiniteQuery({
    queryKey: [
      "qbittorrent",
      "torrents",
      "infinite",
      { filter: filter ?? "all", sort: sort ?? null, reverse: reverse ?? false, pageSize },
    ],
    queryFn: ({ pageParam }) =>
      getTorrents({ filter, sort, reverse, limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    // qBittorrent returns fewer than `limit` rows on the final page, so a short
    // page is the signal that we've reached the end.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled,
  });
}

/**
 * Fetch a single torrent by hash. Uses the `hashes=` query param so the
 * response is one row instead of the entire library. Falls back to a
 * client-side find because demo mode ignores the query param and returns
 * the full mock list.
 */
export function useTorrent(hash: string) {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "torrents", "detail", hash],
    queryFn: async () => {
      const list = await getTorrents({ hashes: [hash] });
      return list.find((t) => t.hash === hash) ?? null;
    },
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!hash,
  });
}

export function useTorrentFiles(hash: string) {
  return useQuery({
    queryKey: ["qbittorrent", "files", hash],
    queryFn: () => getTorrentFiles(hash),
    enabled: !!hash,
  });
}

export function useTorrentTrackers(hash: string) {
  return useQuery({
    queryKey: ["qbittorrent", "trackers", hash],
    queryFn: () => getTorrentTrackers(hash),
    enabled: !!hash,
  });
}

export function usePauseTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hashes: string[]) => pauseTorrents(hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

export function useResumeTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hashes: string[]) => resumeTorrents(hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

export function useDeleteTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      hashes,
      deleteFiles = false,
    }: {
      hashes: string[];
      deleteFiles?: boolean;
    }) => deleteTorrents(hashes, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

export function useAddTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (magnetUri: string) => addTorrentMagnet(magnetUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

// --- Speed Limits ---

export function useSpeedLimitsMode() {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "speedLimitsMode"],
    queryFn: getSpeedLimitsMode,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled,
  });
}

export function useToggleSpeedLimitsMode() {
  const queryClient = useQueryClient();
  const key = ["qbittorrent", "speedLimitsMode"];
  return useMutation({
    mutationFn: toggleSpeedLimitsMode,
    // Flip the switch immediately so the UI reflects the tap; revert on error.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData<boolean>(key, !(prev ?? false));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData<boolean>(key, ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "transfer"] });
    },
  });
}

export function useSpeedPreferences() {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "speedPreferences"],
    queryFn: getSpeedPreferences,
    enabled,
  });
}

export function useSetGlobalSpeedLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    // Limits are bytes/s; 0 = unlimited.
    mutationFn: async (limits: { dl?: number; up?: number }) => {
      if (limits.dl !== undefined) await setDownloadLimit(limits.dl);
      if (limits.up !== undefined) await setUploadLimit(limits.up);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "speedPreferences"] });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "transfer"] });
    },
  });
}

export function useSetAltSpeedLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    // Limits are bytes/s; 0 = unlimited.
    mutationFn: (limits: { dl?: number; up?: number }) => setAltSpeedLimits(limits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "speedPreferences"] });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "transfer"] });
    },
  });
}

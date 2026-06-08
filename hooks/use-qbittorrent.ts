import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  getTransferInfo,
  getTorrents,
  getCategories,
  getTorrentFiles,
  getTorrentTrackers,
  pauseTorrents,
  resumeTorrents,
  reannounceTorrents,
  deleteTorrents,
  addTorrentMagnet,
  setDownloadLimit,
  setUploadLimit,
  setShareLimits,
  setTorrentCategory,
  getSpeedLimitsMode,
  toggleSpeedLimitsMode,
  getSpeedPreferences,
  setAltSpeedLimits,
} from "@/services/qbittorrent-api";
import type { GetTorrentsOptions, QBTorrentFilter } from "@/services/qbittorrent-api";
import type { QBTorrent } from "@/lib/types";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Per-instance cache keying: every hook accepts an optional `instanceId`.
// When omitted, the user's active qBittorrent is used (single-instance
// behavior); when passed (by aggregated dashboard cards or the chip switcher),
// queries fan out to that specific instance with its own cache slot.

export function useTransferInfo(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "transfer"],
    queryFn: () => getTransferInfo(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled: enabled && !!id,
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
export function useDownloadingTorrentsForWatcher(active: boolean, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "torrents", "watcher", "downloading"],
    queryFn: () => getTorrents({ filter: "downloading" }, id ?? undefined),
    refetchInterval: NOTIFICATION_WATCHER_INTERVAL_MS,
    enabled: enabled && active && !!id,
  });
}

/**
 * Bounded torrent fetch with server-side sort/limit/offset/filter. Use this
 * when you only need a slice (e.g. dashboard widget showing the top N).
 */
export function useTorrents(options: GetTorrentsOptions = {}, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "torrents", "list", options],
    queryFn: () => getTorrents(options, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id,
  });
}

/**
 * Paginated torrent list with server-side sort + filter. Each page fetches
 * `pageSize` torrents at the appropriate offset. The default 5s poll refetches
 * all loaded pages, so prefer modest page sizes on large libraries.
 */
export function useInfiniteTorrents({
  filter,
  category,
  sort,
  reverse,
  pageSize = 50,
  instanceId,
}: {
  filter?: QBTorrentFilter;
  // qBittorrent category filter: undefined → all, "" → uncategorized, name →
  // that category. Threaded into the query key so changing it resets paging.
  category?: string;
  sort?: keyof QBTorrent;
  reverse?: boolean;
  pageSize?: number;
  instanceId?: string;
}) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useInfiniteQuery({
    queryKey: [
      "qbittorrent",
      id,
      "torrents",
      "infinite",
      {
        filter: filter ?? "all",
        category: category ?? null,
        sort: sort ?? null,
        reverse: reverse ?? false,
        pageSize,
      },
    ],
    queryFn: ({ pageParam }) =>
      getTorrents(
        { filter, category, sort, reverse, limit: pageSize, offset: pageParam },
        id ?? undefined,
      ),
    initialPageParam: 0,
    // qBittorrent returns fewer than `limit` rows on the final page, so a short
    // page is the signal that we've reached the end.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id,
  });
}

/**
 * Fetch a single torrent by hash. Uses the `hashes=` query param so the
 * response is one row instead of the entire library. Falls back to a
 * client-side find because demo mode ignores the query param and returns
 * the full mock list.
 */
export function useTorrent(hash: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "torrents", "detail", hash],
    queryFn: async () => {
      const list = await getTorrents({ hashes: [hash] }, id ?? undefined);
      return list.find((t) => t.hash === hash) ?? null;
    },
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!hash && !!id,
  });
}

export function useTorrentFiles(hash: string, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "files", hash],
    queryFn: () => getTorrentFiles(hash, id ?? undefined),
    enabled: !!hash && !!id,
  });
}

export function useTorrentTrackers(hash: string, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "trackers", hash],
    queryFn: () => getTorrentTrackers(hash, id ?? undefined),
    enabled: !!hash && !!id,
  });
}

// Category names for the downloads-view category filter. Categories change
// rarely, so no polling — the list refreshes on mount/refetch.
export function useTorrentCategories(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "categories"],
    queryFn: () => getCategories(id ?? undefined),
    enabled: enabled && !!id,
  });
}

// Mutations target the active qBittorrent instance. The dashboard
// aggregation path (step 6) builds slot components that scope their own hooks
// per instance, so even mutations triggered from a per-instance widget hit
// the right server.
export function usePauseTorrent(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    mutationFn: (hashes: string[]) => pauseTorrents(hashes, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] });
    },
  });
}

export function useResumeTorrent(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    mutationFn: (hashes: string[]) => resumeTorrents(hashes, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] });
    },
  });
}

export function useReannounceTorrent(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    mutationFn: (hashes: string[]) => reannounceTorrents(hashes, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] });
    },
  });
}

export function useDeleteTorrent(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    mutationFn: ({
      hashes,
      deleteFiles = false,
    }: {
      hashes: string[];
      deleteFiles?: boolean;
    }) => deleteTorrents(hashes, deleteFiles, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] });
    },
  });
}

export function useAddTorrent(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    mutationFn: (magnetUri: string) => addTorrentMagnet(magnetUri, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] });
    },
  });
}

// --- Share Limits ---

export function useSetShareLimits(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    mutationFn: ({
      hashes,
      ratioLimit,
      seedingTimeLimit,
    }: {
      hashes: string[];
      ratioLimit: number;
      seedingTimeLimit: number;
    }) => setShareLimits(hashes, ratioLimit, seedingTimeLimit, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] });
    },
  });
}

// --- Category ---

export function useSetTorrentCategory(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    // category "" clears the torrent's category (uncategorized).
    mutationFn: ({
      hashes,
      category,
    }: {
      hashes: string[];
      category: string;
    }) => setTorrentCategory(hashes, category, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] });
    },
  });
}

// --- Speed Limits ---

export function useSpeedLimitsMode(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "speedLimitsMode"],
    queryFn: () => getSpeedLimitsMode(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled: enabled && !!id,
  });
}

export function useToggleSpeedLimitsMode(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  const key = ["qbittorrent", id, "speedLimitsMode"];
  return useMutation({
    mutationFn: () => toggleSpeedLimitsMode(id ?? undefined),
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
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "transfer"] });
    },
  });
}

export function useSpeedPreferences(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
  return useQuery({
    queryKey: ["qbittorrent", id, "speedPreferences"],
    queryFn: () => getSpeedPreferences(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useSetGlobalSpeedLimits(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    // Limits are bytes/s; 0 = unlimited.
    mutationFn: async (limits: { dl?: number; up?: number }) => {
      if (limits.dl !== undefined) await setDownloadLimit(limits.dl, id ?? undefined);
      if (limits.up !== undefined) await setUploadLimit(limits.up, id ?? undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "speedPreferences"] });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "transfer"] });
    },
  });
}

export function useSetAltSpeedLimits(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
  return useMutation({
    // Limits are bytes/s; 0 = unlimited.
    mutationFn: (limits: { dl?: number; up?: number }) =>
      setAltSpeedLimits(limits, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "speedPreferences"] });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "transfer"] });
    },
  });
}

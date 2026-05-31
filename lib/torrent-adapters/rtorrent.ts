import { useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useRtorrentGlobalStats } from "@/hooks/use-rtorrent";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getRtorrentTorrents,
  getRtorrentGlobalStats,
  startTorrents,
  stopTorrents,
  eraseTorrents,
  addRtorrentTorrent,
} from "@/services/rtorrent-api";
import { RtorrentSpeedLimitsControl } from "@/components/rtorrent/speed-limits-control";
import type {
  TorrentAdapter,
  TorrentGlobalStats,
  TorrentListFilter,
  TorrentListResult,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";

// rtorrent fetches the whole library in one d.multicall2, so filter + sort are
// applied client-side (the qBittorrent adapter does these server-side). The
// list query key deliberately omits the filter/sort so changing them never
// triggers a refetch — exactly the Usenet-view model.
function applyFilterSort(
  list: UnifiedTorrent[],
  opts: TorrentListFilter,
): UnifiedTorrent[] {
  let out = list;
  if (opts.filter !== "all") {
    out = out.filter((t) => {
      switch (opts.filter) {
        case "downloading":
          return t.status === "downloading" || t.status === "stalled";
        case "seeding":
          return t.status === "seeding";
        case "completed":
          return t.progress >= 1;
        case "paused":
          return t.status === "paused";
        default:
          return true;
      }
    });
  }
  const sorted = [...out];
  switch (opts.sort) {
    case "progress-desc":
      sorted.sort((a, b) => b.progress - a.progress);
      break;
    case "progress-asc":
      sorted.sort((a, b) => a.progress - b.progress);
      break;
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "size-desc":
      sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
      break;
    case "added-desc":
      sorted.sort((a, b) => b.addedOn - a.addedOn);
      break;
  }
  return sorted;
}

export const rtorrentTorrentAdapter: TorrentAdapter = {
  serviceId: "rtorrent",
  displayName: "rTorrent",
  capabilities: {
    altSpeed: false,
    shareLimits: false,
    serverSidePaging: false,
    perTorrentFiles: false,
    globalSpeedLimits: true,
    categories: false,
    deleteWithDataCaveat: true,
  },

  // Unused (perTorrentFiles is false → rows don't drill in), but the interface
  // requires it.
  detailRoute: (hash) => `/torrent/${hash}`,

  useTorrents: (opts: TorrentListFilter, instanceId?: string): TorrentListResult => {
    const { instanceId: id, enabled } = useInstanceTarget("rtorrent", instanceId);
    const q = useQuery({
      queryKey: ["rtorrent", id, "torrents", "all"],
      queryFn: () => getRtorrentTorrents(id ?? undefined),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
      enabled: enabled && !!id,
    });
    const torrents = useMemo(
      () => (q.data ? applyFilterSort(q.data, opts) : []),
      [q.data, opts.filter, opts.sort],
    );
    return {
      torrents,
      isLoading: q.isLoading,
      isRefetching: q.isRefetching,
      error: (q.error as Error) ?? null,
      // rtorrent returns everything in one call — no pagination.
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: () => {},
      refetch: () => q.refetch(),
    };
  },

  useGlobalStats: (instanceId?: string): UseQueryResult<TorrentGlobalStats> =>
    useRtorrentGlobalStats(instanceId),

  globalStatsQueryOptions: (instanceId: string) => ({
    queryKey: ["rtorrent", instanceId, "globalStats"],
    queryFn: () => getRtorrentGlobalStats(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    select: (raw: unknown): TorrentGlobalStats => raw as TorrentGlobalStats,
  }),

  torrentsQueryOptions: (instanceId: string) => ({
    queryKey: ["rtorrent", instanceId, "torrents", "all"],
    queryFn: () => getRtorrentTorrents(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    select: (raw: unknown): UnifiedTorrent[] => raw as UnifiedTorrent[],
  }),

  usePauseTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("rtorrent", instanceId);
    return useMutation({
      mutationFn: (hashes: string[]) => stopTorrents(hashes, id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rtorrent", id] }),
    });
  },

  useResumeTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("rtorrent", instanceId);
    return useMutation({
      mutationFn: (hashes: string[]) => startTorrents(hashes, id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rtorrent", id] }),
    });
  },

  useDeleteTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("rtorrent", instanceId);
    return useMutation({
      mutationFn: ({
        hashes,
        deleteFiles = false,
      }: {
        hashes: string[];
        deleteFiles?: boolean;
      }) => eraseTorrents(hashes, deleteFiles, id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rtorrent", id] }),
    });
  },

  useAddTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("rtorrent", instanceId);
    return useMutation({
      mutationFn: ({
        uri,
        label,
        savePath,
      }: {
        uri: string;
        label?: string;
        savePath?: string;
      }) => addRtorrentTorrent(uri, { label, savePath }, id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rtorrent", id] }),
    });
  },

  SpeedLimitsControl: RtorrentSpeedLimitsControl,
};

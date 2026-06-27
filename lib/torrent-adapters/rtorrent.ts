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
import { applyFilterSort } from "@/lib/torrent-adapters/client-filter-sort";
import type {
  TorrentAdapter,
  TorrentGlobalStats,
  TorrentListFilter,
  TorrentListResult,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";

// rtorrent fetches the whole library in one d.multicall2, so filter + sort are
// applied client-side via the shared applyFilterSort helper (the qBittorrent
// adapter does these server-side). The list query key deliberately omits the
// filter/sort so changing them never triggers a refetch — the Usenet-view model.

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

  // rtorrent has single labels (custom1), not qBittorrent-style categories, so
  // the category filter is never shown (capabilities.categories is false).
  useCategories: (): string[] => [],

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

  // rtorrent has freeform single labels (custom1), not qBittorrent-style
  // categories, so capabilities.categories is false and this is never surfaced.
  // It exists only to satisfy the shared adapter contract (always called).
  useSetCategory: () =>
    useMutation({
      mutationFn: async (_vars: { hashes: string[]; category: string }) => {
        throw new Error("Categories are not supported on rtorrent");
      },
    }),

  SpeedLimitsControl: RtorrentSpeedLimitsControl,
};

import { useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import {
  useTransmissionGlobalStats,
  invalidateTransmissionTorrents,
} from "@/hooks/use-transmission";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getTransmissionGlobalStats,
  getTransmissionTorrents,
  startTransmissionTorrents,
  stopTransmissionTorrents,
  removeTransmissionTorrents,
  addTransmissionTorrent,
} from "@/services/transmission-api";
import { TransmissionSpeedLimitsControl } from "@/components/transmission/speed-limits-control";
import { applyFilterSort } from "@/lib/torrent-adapters/client-filter-sort";
import type {
  TorrentAdapter,
  TorrentGlobalStats,
  TorrentListFilter,
  TorrentListResult,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";

// Transmission's torrent-get returns the whole library with no server-side
// paging/sort/filter, so the list mirrors rtorrent (fetch-all + client-side
// applyFilterSort, no pagination). The detail screen, turtle mode, and
// per-torrent ratio limits mirror qBittorrent — hence the richer capabilities.
export const transmissionTorrentAdapter: TorrentAdapter = {
  serviceId: "transmission",
  displayName: "Transmission",
  capabilities: {
    altSpeed: true, // alt-speed ("turtle") mode
    shareLimits: true, // per-torrent seedRatio/seedIdle limits
    serverSidePaging: false, // torrent-get returns everything in one call
    perTorrentFiles: true, // files + trackers via torrent-get → detail screen
    globalSpeedLimits: true,
    categories: false, // Transmission uses free-form labels, not categories
  },

  detailRoute: (hash) => `/transmission/${hash}`,

  useTorrents: (opts: TorrentListFilter, instanceId?: string): TorrentListResult => {
    const { instanceId: id, enabled } = useInstanceTarget("transmission", instanceId);
    const q = useQuery({
      queryKey: ["transmission", id, "torrents", "all"],
      queryFn: () => getTransmissionTorrents(id ?? undefined),
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
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: () => {},
      refetch: () => q.refetch(),
    };
  },

  // Transmission has labels, not qBittorrent-style categories, so the category
  // filter is never shown (capabilities.categories is false).
  useCategories: (): string[] => [],

  useGlobalStats: (instanceId?: string): UseQueryResult<TorrentGlobalStats> =>
    useTransmissionGlobalStats(instanceId),

  globalStatsQueryOptions: (instanceId: string) => ({
    queryKey: ["transmission", instanceId, "globalStats"],
    queryFn: () => getTransmissionGlobalStats(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    select: (raw: unknown): TorrentGlobalStats => raw as TorrentGlobalStats,
  }),

  torrentsQueryOptions: (instanceId: string) => ({
    queryKey: ["transmission", instanceId, "torrents", "all"],
    queryFn: () => getTransmissionTorrents(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    select: (raw: unknown): UnifiedTorrent[] => raw as UnifiedTorrent[],
  }),

  usePauseTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("transmission", instanceId);
    return useMutation({
      mutationFn: (hashes: string[]) => stopTransmissionTorrents(hashes, id ?? undefined),
      onSuccess: () => invalidateTransmissionTorrents(queryClient, id),
    });
  },

  useResumeTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("transmission", instanceId);
    return useMutation({
      mutationFn: (hashes: string[]) => startTransmissionTorrents(hashes, id ?? undefined),
      onSuccess: () => invalidateTransmissionTorrents(queryClient, id),
    });
  },

  useDeleteTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("transmission", instanceId);
    return useMutation({
      mutationFn: ({
        hashes,
        deleteFiles = false,
      }: {
        hashes: string[];
        deleteFiles?: boolean;
      }) => removeTransmissionTorrents(hashes, deleteFiles, id ?? undefined),
      onSuccess: () => invalidateTransmissionTorrents(queryClient, id),
    });
  },

  useAddTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("transmission", instanceId);
    return useMutation({
      mutationFn: ({
        uri,
        label,
        savePath,
      }: {
        uri: string;
        label?: string;
        savePath?: string;
      }) => addTransmissionTorrent(uri, { label, savePath }, id ?? undefined),
      onSuccess: () => invalidateTransmissionTorrents(queryClient, id),
    });
  },

  // Transmission has labels, not categories, so capabilities.categories is false
  // and this is never surfaced — it exists only to satisfy the adapter contract.
  useSetCategory: () =>
    useMutation({
      mutationFn: async (_vars: { hashes: string[]; category: string }) => {
        throw new Error("Categories are not supported on Transmission");
      },
    }),

  SpeedLimitsControl: TransmissionSpeedLimitsControl,
};

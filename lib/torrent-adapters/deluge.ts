import { useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useDelugeGlobalStats, invalidateDelugeTorrents } from "@/hooks/use-deluge";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getDelugeGlobalStats,
  getDelugeTorrents,
  pauseDelugeTorrents,
  resumeDelugeTorrents,
  removeDelugeTorrents,
  addDelugeTorrent,
} from "@/services/deluge-api";
import { DelugeSpeedLimitsControl } from "@/components/deluge/speed-limits-control";
import { applyFilterSort } from "@/lib/torrent-adapters/client-filter-sort";
import type {
  TorrentAdapter,
  TorrentGlobalStats,
  TorrentListFilter,
  TorrentListResult,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";

// Deluge's core.get_torrents_status returns the whole library in one call with
// no server-side paging or sort, so the list mirrors rtorrent/Transmission
// (fetch-all + client-side applyFilterSort). The detail screen and per-torrent
// ratio limits mirror Transmission. What Deluge does NOT have is a turtle mode
// (no alt-speed anywhere in its core) or qBittorrent-style categories — its
// Label plugin is optional, single-valued and has to pre-create every label, so
// it stays out of the category filter the same way rtorrent's custom1 does.
export const delugeTorrentAdapter: TorrentAdapter = {
  serviceId: "deluge",
  displayName: "Deluge",
  capabilities: {
    altSpeed: false, // Deluge has no alt-speed/turtle mode
    shareLimits: true, // per-torrent stop_at_ratio / stop_ratio / remove_at_ratio
    serverSidePaging: false, // get_torrents_status returns everything at once
    perTorrentFiles: true, // files + file_progress + trackers → detail screen
    globalSpeedLimits: true, // core config max_download_speed / max_upload_speed
    categories: false, // labels are an optional plugin, not categories
  },

  // Pin the source instance in the route so a row opened from the multi-
  // instance dashboard widget queries and mutates the server it came from,
  // not whichever Deluge is currently active.
  detailRoute: (hash, instanceId) =>
    instanceId
      ? `/deluge/${hash}?instanceId=${encodeURIComponent(instanceId)}`
      : `/deluge/${hash}`,

  useTorrents: (opts: TorrentListFilter, instanceId?: string): TorrentListResult => {
    const { instanceId: id, enabled } = useInstanceTarget("deluge", instanceId);
    const q = useQuery({
      queryKey: ["deluge", id, "torrents", "all"],
      queryFn: () => getDelugeTorrents(id ?? undefined),
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

  // Deluge's labels come from an optional plugin and are not qBittorrent-style
  // categories, so the category filter is never shown.
  useCategories: (): string[] => [],

  useGlobalStats: (instanceId?: string): UseQueryResult<TorrentGlobalStats> =>
    useDelugeGlobalStats(instanceId),

  globalStatsQueryOptions: (instanceId: string) => ({
    queryKey: ["deluge", instanceId, "globalStats"],
    queryFn: () => getDelugeGlobalStats(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    select: (raw: unknown): TorrentGlobalStats => raw as TorrentGlobalStats,
  }),

  torrentsQueryOptions: (instanceId: string) => ({
    queryKey: ["deluge", instanceId, "torrents", "all"],
    queryFn: () => getDelugeTorrents(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    select: (raw: unknown): UnifiedTorrent[] => raw as UnifiedTorrent[],
  }),

  usePauseTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("deluge", instanceId);
    return useMutation({
      mutationFn: (hashes: string[]) => pauseDelugeTorrents(hashes, id ?? undefined),
      onSuccess: () => invalidateDelugeTorrents(queryClient, id),
    });
  },

  useResumeTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("deluge", instanceId);
    return useMutation({
      mutationFn: (hashes: string[]) => resumeDelugeTorrents(hashes, id ?? undefined),
      onSuccess: () => invalidateDelugeTorrents(queryClient, id),
    });
  },

  useDeleteTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("deluge", instanceId);
    return useMutation({
      mutationFn: ({
        hashes,
        deleteFiles = false,
      }: {
        hashes: string[];
        deleteFiles?: boolean;
      }) => removeDelugeTorrents(hashes, deleteFiles, id ?? undefined),
      onSuccess: () => invalidateDelugeTorrents(queryClient, id),
    });
  },

  useAddTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("deluge", instanceId);
    return useMutation({
      mutationFn: ({
        uri,
        label,
        savePath,
      }: {
        uri: string;
        label?: string;
        savePath?: string;
      }) => addDelugeTorrent(uri, { label, savePath }, id ?? undefined),
      onSuccess: () => invalidateDelugeTorrents(queryClient, id),
    });
  },

  // Deluge has no categories (capabilities.categories is false), so this is
  // never surfaced — it exists only to satisfy the adapter contract.
  useSetCategory: () =>
    useMutation({
      mutationFn: async (_vars: { hashes: string[]; category: string }) => {
        throw new Error("Categories are not supported on Deluge");
      },
    }),

  SpeedLimitsControl: DelugeSpeedLimitsControl,
};

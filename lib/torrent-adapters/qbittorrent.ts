import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  useInfiniteTorrents,
  useTorrentCategories,
  usePauseTorrent as useQbPauseTorrent,
  useResumeTorrent as useQbResumeTorrent,
  useDeleteTorrent as useQbDeleteTorrent,
} from "@/hooks/use-qbittorrent";
import {
  getServerState,
  getTransferInfo,
  getTorrents,
  addTorrentMagnet,
  type QBTorrentFilter,
} from "@/services/qbittorrent-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { POLLING_INTERVALS } from "@/lib/constants";
import { isTorrentPaused } from "@/lib/types";
import type { QBTorrent, QBServerState, TorrentState } from "@/lib/types";
import { QbittorrentSpeedLimitsControl } from "@/components/qbittorrent/speed-limits-control";
import type {
  TorrentAdapter,
  TorrentFilterType,
  TorrentGlobalStats,
  TorrentListFilter,
  TorrentListResult,
  TorrentStatus,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";
import type { DownloadsSortKey } from "@/store/sort-store";

// "all" omits the qBittorrent `filter` param rather than sending `filter=all`
// (functionally identical, a few bytes cheaper). The remaining values map 1:1.
function tabFilterToQB(filter: TorrentFilterType): QBTorrentFilter | undefined {
  return filter === "all" ? undefined : filter;
}

// Sort key from the downloads sort store → qBittorrent's server-side `sort`
// field name + `reverse`.
function sortKeyToQB(key: DownloadsSortKey): { sort: keyof QBTorrent; reverse: boolean } {
  switch (key) {
    case "progress-desc":
      return { sort: "progress", reverse: true };
    case "progress-asc":
      return { sort: "progress", reverse: false };
    case "name-asc":
      return { sort: "name", reverse: false };
    case "size-desc":
      return { sort: "size", reverse: true };
    case "added-desc":
      return { sort: "added_on", reverse: true };
  }
}

function qbStatusToUnified(state: TorrentState): TorrentStatus {
  if (state === "error" || state === "missingFiles") return "errored";
  if (
    state === "checkingUP" ||
    state === "checkingDL" ||
    state === "checkingResumeData" ||
    state === "allocating" ||
    state === "moving"
  )
    return "checking";
  if (isTorrentPaused(state)) return "paused";
  if (state === "stalledUP" || state === "stalledDL") return "stalled";
  if (state === "queuedUP" || state === "queuedDL") return "queued";
  if (state === "uploading" || state === "forcedUP") return "seeding";
  if (state === "downloading" || state === "metaDL" || state === "forcedDL")
    return "downloading";
  return "other";
}

// Preserves qBittorrent's exact per-state badge colors (the legacy
// getTorrentBadgeVariant): paused/error checked first, then the DL/UP suffix
// tests so stalled/checking/queued keep their downloading/seeding hues.
function qbBadgeVariant(
  state: TorrentState,
): "downloading" | "seeding" | "paused" | "error" | "default" {
  if (state === "error" || state === "missingFiles") return "error";
  if (isTorrentPaused(state)) return "paused";
  if (state.includes("DL") || state === "downloading" || state === "metaDL")
    return "downloading";
  if (state.includes("UP") || state === "uploading") return "seeding";
  return "default";
}

function qbToUnified(t: QBTorrent): UnifiedTorrent {
  return {
    hash: t.hash,
    name: t.name,
    sizeBytes: t.size,
    progress: t.progress,
    dlSpeed: t.dlspeed,
    upSpeed: t.upspeed,
    eta: t.eta,
    ratio: t.ratio,
    status: qbStatusToUnified(t.state),
    statusLabel: t.state,
    badgeVariant: qbBadgeVariant(t.state),
    label: t.category,
    tags: t.tags,
    addedOn: t.added_on,
    completedOn: t.completion_on > 0 ? t.completion_on : undefined,
    savePath: t.save_path,
    amountLeft: t.amount_left,
    downloaded: t.downloaded,
    uploaded: t.uploaded,
    errorMessage: undefined,
  };
}

export const qbittorrentTorrentAdapter: TorrentAdapter = {
  serviceId: "qbittorrent",
  displayName: "qBittorrent",
  capabilities: {
    altSpeed: true,
    shareLimits: true,
    serverSidePaging: true,
    perTorrentFiles: true,
    globalSpeedLimits: true,
    categories: true,
  },

  detailRoute: (hash) => `/torrent/${hash}`,

  useTorrents: (opts: TorrentListFilter, instanceId?: string): TorrentListResult => {
    const { sort, reverse } = sortKeyToQB(opts.sort);
    const q = useInfiniteTorrents({
      filter: tabFilterToQB(opts.filter),
      category: opts.category,
      sort,
      reverse,
      pageSize: 50,
      instanceId,
    });
    // Server-side sort means we flatten pages in order — no client re-sort.
    const torrents = (q.data?.pages ?? []).flat().map(qbToUnified);
    return {
      torrents,
      isLoading: q.isLoading,
      isRefetching: q.isRefetching,
      error: (q.error as Error) ?? null,
      hasNextPage: q.hasNextPage ?? false,
      isFetchingNextPage: q.isFetchingNextPage,
      isFetchNextPageError: q.isFetchNextPageError,
      fetchNextPage: () => q.fetchNextPage(),
      refetch: () => q.refetch(),
    };
  },

  useCategories: (instanceId?: string): string[] => {
    const { data } = useTorrentCategories(instanceId);
    return data ?? [];
  },

  useGlobalStats: (instanceId?: string): UseQueryResult<TorrentGlobalStats> => {
    const { instanceId: id, enabled } = useInstanceTarget("qbittorrent", instanceId);
    // Shares the ["qbittorrent", id, "transfer"] cache key + select-maps to the
    // normalized shape. Lifetime totals aren't in /transfer/info — the dashboard
    // speed card reads those via globalStatsQueryOptions (server_state) instead.
    return useQuery({
      queryKey: ["qbittorrent", id, "transfer"],
      queryFn: () => getTransferInfo(id ?? undefined),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
      enabled: enabled && !!id,
      select: (t): TorrentGlobalStats => ({
        dlSpeed: t.dl_info_speed,
        upSpeed: t.up_info_speed,
        dlTotalLifetime: 0,
        upTotalLifetime: 0,
        dlLimit: t.dl_rate_limit,
        upLimit: t.up_rate_limit,
      }),
    });
  },

  globalStatsQueryOptions: (instanceId: string) => ({
    queryKey: ["qbittorrent", instanceId, "globalStats"],
    queryFn: () => getServerState(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    select: (raw: unknown): TorrentGlobalStats => {
      const s = raw as QBServerState;
      return {
        dlSpeed: s.dl_info_speed,
        upSpeed: s.up_info_speed,
        dlTotalLifetime: s.alltime_dl,
        upTotalLifetime: s.alltime_ul,
        dlLimit: 0,
        upLimit: 0,
      };
    },
  }),

  torrentsQueryOptions: (instanceId: string) => ({
    queryKey: ["qbittorrent", instanceId, "torrents", "card"],
    queryFn: () => getTorrents({}, instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    select: (raw: unknown): UnifiedTorrent[] => (raw as QBTorrent[]).map(qbToUnified),
  }),

  usePauseTorrent: (instanceId?: string) => useQbPauseTorrent(instanceId),
  useResumeTorrent: (instanceId?: string) => useQbResumeTorrent(instanceId),
  useDeleteTorrent: (instanceId?: string) => useQbDeleteTorrent(instanceId),

  useAddTorrent: (instanceId?: string) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("qbittorrent", instanceId);
    // qBittorrent's add takes a bare magnet/URL; the unified surface adds
    // optional label/savePath which qBittorrent ignores for v1.
    return useMutation({
      mutationFn: ({ uri }: { uri: string; label?: string; savePath?: string }) =>
        addTorrentMagnet(uri, id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["qbittorrent", id, "torrents"] }),
    });
  },

  SpeedLimitsControl: QbittorrentSpeedLimitsControl,
};

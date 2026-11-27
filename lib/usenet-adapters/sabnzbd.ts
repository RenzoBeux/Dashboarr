import { useCallback } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { SabQueue } from "@/lib/types";
import {
  addSabFile,
  addSabUrl,
  deleteSabHistorySlot,
  deleteSabSlot,
  getSabHistory,
  getSabQueue,
  getSabQueueSummary,
  pauseSabAll,
  pauseSabSlot,
  resumeSabAll,
  resumeSabSlot,
} from "@/services/sabnzbd-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { mergeSabQueuePages, sabQueuePageQueries } from "@/lib/sab-queue-pages";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { SabnzbdSpeedLimitsControl } from "@/components/sabnzbd/speed-limits-control";
import type {
  UnifiedItem,
  UsenetAdapter,
  UsenetHistoryState,
  UsenetQueueList,
  UsenetQueuePaging,
  UsenetQueueState,
  UsenetStatus,
} from "@/lib/usenet-adapter";
import type {
  SabHistorySlot,
  SabQueueSlot,
  SabSlotStatus,
} from "@/lib/types";

function parseFloatSafe(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function classifySabStatus(status: SabSlotStatus): UsenetStatus {
  switch (status) {
    case "Paused":
      return "paused";
    case "Queued":
      return "queued";
    case "Completed":
      return "completed";
    case "Failed":
      return "failed";
    case "Downloading":
    case "Grabbing":
    case "Fetching":
    case "Checking":
    case "Verifying":
    case "Repairing":
    case "Extracting":
    case "Moving":
      return "downloading";
    default:
      return "other";
  }
}

function queueSlotToItem(s: SabQueueSlot): UnifiedItem {
  return {
    id: s.nzo_id,
    name: s.filename,
    category: s.cat,
    status: classifySabStatus(s.status),
    statusLabel: s.status,
    progress: parseFloatSafe(s.percentage) / 100,
    sizeLabel: s.size,
    timeleft: s.timeleft,
    source: "queue",
    bytes: parseFloatSafe(s.mb) * 1024 * 1024,
    index: s.index,
    addedAt: s.time_added || undefined,
  };
}

function historySlotToItem(s: SabHistorySlot, index: number): UnifiedItem {
  return {
    id: s.nzo_id,
    name: s.name,
    category: s.category,
    status: classifySabStatus(s.status),
    statusLabel: s.status,
    progress: s.status === "Completed" ? 1 : 0,
    sizeLabel: s.size,
    source: "history",
    bytes: s.bytes,
    // SAB returns history newest-first with no index field; flip the array
    // index so newer items sort with the highest "index" for "added-desc".
    index: -index,
  };
}

function queueState(queue: SabQueue): UsenetQueueState {
  return {
    items: queue.slots.map(queueSlotToItem),
    paused: queue.paused,
    speedLabel: queue.speed?.trim() ? `${queue.speed}B/s` : undefined,
    sizeLeftLabel: queue.sizeleft || undefined,
  };
}

// The statuses SAB can filter on itself. Only "paused" maps one to one: while
// the downloader runs, SAB reports every other unpaused job as "Downloading"
// whatever its internal status (api.py build_queue), so a server-side
// "Queued" filter would return rows the list then shows as downloading.
function sabServerStatus(status?: UsenetStatus): string[] | undefined {
  return status === "paused" ? ["Paused"] : undefined;
}

// The page queries' answers as the list's queue (see mergeSabQueuePages).
function combineSabPages(
  results: UseQueryResult<SabQueue>[],
  statusFiltered: boolean,
  headerOnly: boolean,
) {
  const merged = mergeSabQueuePages(
    results.map((r) => r.data),
    statusFiltered,
  );
  const first = results[0];
  const last = results[results.length - 1];
  const newestMissing = results.length > 1 && last.data === undefined;
  const data: UsenetQueueState | undefined = merged && {
    ...queueState({ ...merged.head, slots: [] }),
    items: headerOnly
      ? []
      : merged.slots.map(({ slot, page }) => ({ ...queueSlotToItem(slot), page })),
    hasMore: headerOnly ? false : merged.hasMore,
    total: merged.total,
  };
  return {
    data,
    error: first.error,
    isLoading: first.isLoading,
    loadingMore: newestMissing && last.isFetching,
    loadMoreError: newestMissing && !last.isFetching ? last.error : null,
    retryNewest: last.refetch,
  };
}

// The Downloads list's queue, a page per request (see sabQueuePageQueries).
function useSabQueueList(
  instanceId: string | undefined,
  paging: UsenetQueuePaging | undefined,
): UsenetQueueList {
  const { instanceId: id, enabled } = useInstanceTarget("sabnzbd", instanceId);
  const queryClient = useQueryClient();
  const active = enabled && !!id;
  const headerOnly = paging?.pages === 0;
  const status = sabServerStatus(paging?.status);

  const statusFiltered = !!status;
  const combine = useCallback(
    (results: UseQueryResult<SabQueue>[]) =>
      combineSabPages(results, statusFiltered, headerOnly),
    [statusFiltered, headerOnly],
  );
  const list = useQueries({
    queries: headerOnly
      ? [
          {
            // The History filters show no queue rows: one job is enough for
            // the header, shared with the speed-limit button's poll.
            queryKey: ["sabnzbd", id, "queue", "summary"] as const,
            queryFn: () => getSabQueueSummary(id ?? undefined),
            refetchInterval: POLLING_INTERVALS.activeTorrents,
            enabled: active,
          },
        ]
      : sabQueuePageQueries({
          instanceId: id,
          active,
          status,
          pages: paging?.pages ?? 1,
          livePages: paging?.livePages ?? [],
          pollInterval: POLLING_INTERVALS.activeTorrents,
          read: (query) => getSabQueue(id ?? undefined, query),
        }),
    combine,
  });

  const { retryNewest, ...rest } = list;
  const retryLoadMore = useCallback(() => {
    void retryNewest();
  }, [retryNewest]);
  const loadMoreFailed = !!rest.loadMoreError;
  const refetch = useCallback(
    () =>
      Promise.all([
        // Refetches the polling pages now and marks the rest stale.
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id, "queue", "page"] }),
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id, "queue", "summary"] }),
        loadMoreFailed ? retryNewest() : undefined,
      ]),
    [queryClient, id, loadMoreFailed, retryNewest],
  );
  return { ...rest, retryLoadMore, refetch };
}

export const sabnzbdAdapter: UsenetAdapter = {
  serviceId: "sabnzbd",
  displayName: "SABnzbd",
  detailRoute: (id, instanceId) =>
    instanceId ? `/sab/${id}?instanceId=${instanceId}` : `/sab/${id}`,

  useQueue: (instanceId, paging) => useSabQueueList(instanceId, paging),

  queueQueryOptions: (instanceId) => ({
    queryKey: ["sabnzbd", instanceId, "queue"],
    queryFn: () => getSabQueue(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    select: (raw): UsenetQueueState => queueState(raw as SabQueue),
  }),

  useHistory: (limit, instanceId) => {
    const { instanceId: id, enabled } = useInstanceTarget("sabnzbd", instanceId);
    return useQuery({
      queryKey: ["sabnzbd", id, "history", limit],
      queryFn: () => getSabHistory(limit, id ?? undefined),
      refetchInterval: POLLING_INTERVALS.queue,
      enabled: enabled && !!id,
      select: (history): UsenetHistoryState => ({
        items: history.slots.map(historySlotToItem),
      }),
    });
  },

  usePauseSlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: (nzoId: string) => pauseSabSlot(nzoId, id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  useResumeSlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: (nzoId: string) => resumeSabSlot(nzoId, id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  useDeleteSlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: ({ id: nzoId, deleteFiles = false }: { id: string; deleteFiles?: boolean }) =>
        deleteSabSlot(nzoId, deleteFiles, id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  useDeleteHistorySlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: ({ id: nzoId, deleteFiles = false }: { id: string; deleteFiles?: boolean }) =>
        deleteSabHistorySlot(nzoId, deleteFiles, id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  useAddUrl: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: ({ url, category }: { url: string; category?: string }) =>
        addSabUrl(url, category, id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  useAddFile: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: ({
        fileUri,
        fileName,
        category,
      }: {
        fileUri: string;
        fileName: string;
        category?: string;
      }) => addSabFile(fileUri, fileName, category, id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  usePauseAll: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: () => pauseSabAll(id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  useResumeAll: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
    return useMutation({
      mutationFn: () => resumeSabAll(id ?? undefined),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] }),
    });
  },

  SpeedLimitsControl: SabnzbdSpeedLimitsControl,
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { SAB_QUEUE_PAGE_SIZE } from "@/lib/sab-queue-snapshot";
import { useSabQueueSnapshot } from "@/hooks/use-sab-queue-snapshot";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { SabnzbdSpeedLimitsControl } from "@/components/sabnzbd/speed-limits-control";
import type {
  UnifiedItem,
  UsenetAdapter,
  UsenetHistoryState,
  UsenetQueueList,
  UsenetQueueState,
  UsenetQueueView,
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

// The Downloads list's queue: the whole queue, read and kept current by
// useSabQueueSnapshot, or only the header for the History filters.
function useSabQueueList(
  instanceId: string | undefined,
  view: UsenetQueueView | undefined,
): UsenetQueueList {
  const { instanceId: id, enabled } = useInstanceTarget("sabnzbd", instanceId);
  const headerOnly = !!view?.headerOnly;
  // The History filters show no queue rows: one job is enough for the header,
  // shared with the speed-limit button's poll.
  const summary = useQuery({
    queryKey: ["sabnzbd", id, "queue", "summary"],
    queryFn: () => getSabQueueSummary(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id && headerOnly,
  });
  const snapshot = useSabQueueSnapshot(instanceId, {
    status: sabServerStatus(view?.status),
    livePages: view?.livePages ?? [],
    enabled: !headerOnly,
  });

  if (headerOnly) {
    return {
      data: summary.data && { ...queueState(summary.data), items: [] },
      error: summary.error,
      isLoading: summary.isLoading,
      partial: false,
      readError: null,
      retryRead: () => {},
      refetch: summary.refetch,
    };
  }
  const queue = snapshot.queue;
  return {
    data: queue && {
      ...queueState(queue),
      items: queue.slots.map((slot) => ({
        ...queueSlotToItem(slot),
        page: Math.floor(slot.index / SAB_QUEUE_PAGE_SIZE),
      })),
    },
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    partial: !!queue && !snapshot.complete,
    readError: snapshot.readError,
    retryRead: snapshot.retryRead,
    refetch: snapshot.refetch,
  };
}

export const sabnzbdAdapter: UsenetAdapter = {
  serviceId: "sabnzbd",
  displayName: "SABnzbd",
  detailRoute: (id, instanceId) =>
    instanceId ? `/sab/${id}?instanceId=${instanceId}` : `/sab/${id}`,

  useQueue: (instanceId, view) => useSabQueueList(instanceId, view),

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

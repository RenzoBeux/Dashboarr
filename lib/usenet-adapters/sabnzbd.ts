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
import { sabQueueHasMore, sabQueueWindowRequest } from "@/lib/sab-queue-window";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { SabnzbdSpeedLimitsControl } from "@/components/sabnzbd/speed-limits-control";
import type {
  UnifiedItem,
  UsenetAdapter,
  UsenetHistoryState,
  UsenetQueueState,
  UsenetQueueWindow,
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

// One window of the queue plus what the list needs to page further.
interface SabQueuePage {
  queue: SabQueue;
  hasMore: boolean;
  total?: number;
}

// The statuses SAB can filter on itself. Only "paused" maps one to one: while
// the downloader runs, SAB reports every other unpaused job as "Downloading"
// whatever its internal status (api.py build_queue), so a server-side
// "Queued" filter would return rows the list then shows as downloading.
function sabServerStatus(status?: UsenetStatus): string[] | undefined {
  return status === "paused" ? ["Paused"] : undefined;
}

async function fetchSabQueuePage(
  instanceId: string | undefined,
  window?: UsenetQueueWindow,
): Promise<SabQueuePage> {
  if (!window) {
    const queue = await getSabQueue(instanceId);
    return { queue, hasMore: false, total: Number(queue.noofslots) };
  }
  // Newest first reads the tail, and SAB pages from the head only, so the
  // queue length comes first from a one-job answer. That rules out the server
  // status filter there: SAB can't count its matches to locate their tail, so
  // the list filters the tail window itself.
  const fromEnd = window.fromEnd;
  const status = fromEnd ? undefined : sabServerStatus(window.status);
  const queueLength = fromEnd
    ? Number((await getSabQueueSummary(instanceId)).noofslots)
    : undefined;
  const request = sabQueueWindowRequest(window.limit, fromEnd, queueLength);
  const queue = await getSabQueue(instanceId, { ...request, status });
  return {
    queue,
    hasMore: sabQueueHasMore(
      { noofslots: Number(queue.noofslots), slots: queue.slots },
      request,
      !!status,
    ),
    total: status ? undefined : Number(queue.noofslots),
  };
}

export const sabnzbdAdapter: UsenetAdapter = {
  serviceId: "sabnzbd",
  displayName: "SABnzbd",
  detailRoute: (id, instanceId) =>
    instanceId ? `/sab/${id}?instanceId=${instanceId}` : `/sab/${id}`,

  useQueue: (instanceId, window) => {
    const { instanceId: id, enabled } = useInstanceTarget("sabnzbd", instanceId);
    return useQuery({
      // Not ["sabnzbd", id, "queue"]: queueQueryOptions caches the raw SabQueue
      // there, and one key must hold one data shape.
      queryKey: [
        "sabnzbd",
        id,
        "queue",
        "page",
        window?.limit ?? 0,
        window?.fromEnd ?? false,
        window?.status ?? "all",
      ],
      queryFn: () => fetchSabQueuePage(id ?? undefined, window),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
      enabled: enabled && !!id,
      // Growing the window, or a new sort/filter, keeps the current rows on
      // screen until the new slice lands. Never across instances.
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[1] === id ? previous : undefined,
      select: (page): UsenetQueueState => ({
        ...queueState(page.queue),
        hasMore: page.hasMore,
        total: page.total,
      }),
    });
  },

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

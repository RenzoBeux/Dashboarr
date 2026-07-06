import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SabQueue } from "@/lib/types";
import {
  addSabFile,
  addSabUrl,
  deleteSabHistorySlot,
  deleteSabSlot,
  getSabHistory,
  getSabQueue,
  pauseSabAll,
  pauseSabSlot,
  resumeSabAll,
  resumeSabSlot,
} from "@/services/sabnzbd-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import type {
  UnifiedItem,
  UsenetAdapter,
  UsenetHistoryState,
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

export const sabnzbdAdapter: UsenetAdapter = {
  serviceId: "sabnzbd",
  displayName: "SABnzbd",
  detailRoute: (id, instanceId) =>
    instanceId ? `/sab/${id}?instanceId=${instanceId}` : `/sab/${id}`,

  useQueue: (instanceId) => {
    const { instanceId: id, enabled } = useInstanceTarget("sabnzbd", instanceId);
    return useQuery({
      queryKey: ["sabnzbd", id, "queue"],
      queryFn: () => getSabQueue(id ?? undefined),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
      enabled: enabled && !!id,
      select: (queue): UsenetQueueState => ({
        items: queue.slots.map(queueSlotToItem),
        paused: queue.paused,
        speedLabel: queue.speed?.trim() ? `${queue.speed}B/s` : undefined,
        sizeLeftLabel: queue.sizeleft || undefined,
      }),
    });
  },

  queueQueryOptions: (instanceId) => ({
    queryKey: ["sabnzbd", instanceId, "queue"],
    queryFn: () => getSabQueue(instanceId) as Promise<unknown>,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    select: (raw): UsenetQueueState => {
      const queue = raw as SabQueue;
      return {
        items: queue.slots.map(queueSlotToItem),
        paused: queue.paused,
        speedLabel: queue.speed?.trim() ? `${queue.speed}B/s` : undefined,
        sizeLeftLabel: queue.sizeleft || undefined,
      };
    },
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
};

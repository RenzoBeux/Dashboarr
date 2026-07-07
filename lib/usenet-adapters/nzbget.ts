import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import {
  addNzbgetFile,
  addNzbgetUrl,
  deleteNzbgetGroup,
  deleteNzbgetHistorySlot,
  getNzbgetGroups,
  getNzbgetHistory,
  getNzbgetStatus,
  pauseNzbgetAll,
  pauseNzbgetGroup,
  resumeNzbgetAll,
  resumeNzbgetGroup,
} from "@/services/nzbget-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { NzbgetSpeedLimitsControl } from "@/components/nzbget/speed-limits-control";
import { combineHiLo, formatBytes, formatEta, formatSpeed } from "@/lib/utils";
import type {
  UnifiedItem,
  UsenetAdapter,
  UsenetHistoryState,
  UsenetQueueState,
  UsenetStatus,
} from "@/lib/usenet-adapter";
import type {
  NzbgetGroup,
  NzbgetGroupStatus,
  NzbgetHistoryItem,
  NzbgetStatus,
} from "@/lib/types";

function classifyGroupStatus(status: NzbgetGroupStatus): UsenetStatus {
  switch (status) {
    case "PAUSED":
      return "paused";
    case "QUEUED":
    case "PP_QUEUED":
      return "queued";
    case "DOWNLOADING":
    case "FETCHING":
    case "PARSING":
    case "REPAIRING":
    case "UNPACKING":
    case "MOVING":
    case "VERIFYING":
    case "RENAMING":
    case "DELETING":
      return "downloading";
    default:
      return "other";
  }
}

// History `Status` is a composite like "SUCCESS/ALL", "FAILURE/PAR",
// "WARNING/HEALTH", "DELETED/MANUAL". The prefix before the slash is the
// outcome; everything else is sub-classification we don't surface.
function classifyHistoryStatus(rawStatus: string): UsenetStatus {
  const head = rawStatus.split("/")[0];
  if (head === "SUCCESS") return "completed";
  if (head === "FAILURE") return "failed";
  if (head === "WARNING") return "completed"; // delivered with warnings
  if (head === "DELETED") return "other";
  return "other";
}

function groupToItem(g: NzbgetGroup): UnifiedItem {
  const totalBytes = combineHiLo(g.FileSizeHi, g.FileSizeLo);
  const remainingBytes = combineHiLo(g.RemainingSizeHi, g.RemainingSizeLo);
  const downloadedBytes = totalBytes - remainingBytes;
  const progress = totalBytes > 0 ? Math.max(0, Math.min(1, downloadedBytes / totalBytes)) : 0;
  const eta =
    g.DownloadRate && g.DownloadRate > 0 && remainingBytes > 0
      ? formatEta(Math.round(remainingBytes / g.DownloadRate))
      : undefined;

  return {
    id: String(g.NZBID),
    name: g.NZBName,
    category: g.Category,
    status: classifyGroupStatus(g.Status),
    statusLabel: g.Status,
    progress,
    sizeLabel: formatBytes(totalBytes),
    timeleft: eta,
    source: "queue",
    bytes: totalBytes,
    // NZBGet returns groups in queue order — earlier index = earlier in queue.
    // We don't get a numeric position, so the array index suffices for "added"
    // sort within a single instance.
    index: 0,
  };
}

function historyToItem(h: NzbgetHistoryItem, index: number): UnifiedItem {
  const totalBytes = combineHiLo(h.FileSizeHi, h.FileSizeLo);
  const status = classifyHistoryStatus(h.Status);

  return {
    id: String(h.NZBID),
    name: h.NZBName,
    category: h.Category,
    status,
    statusLabel: h.Status,
    progress: status === "completed" ? 1 : 0,
    sizeLabel: formatBytes(totalBytes),
    source: "history",
    bytes: totalBytes,
    // History is returned newest-first; flip the array index so newer items
    // sort with the highest "index" for "added-desc" behavior.
    index: -index,
  };
}

// The queue endpoint (listgroups) doesn't include a global paused flag or
// download speed — those live in the separate `status` endpoint. To populate
// UsenetQueueState we need both, so the queue query joins them via Promise.all
// inside the queryFn rather than invoking two queries.
async function fetchQueueState(instanceId?: string): Promise<UsenetQueueState> {
  const [groups, status] = await Promise.all([
    getNzbgetGroups(instanceId),
    getNzbgetStatus(instanceId).catch(() => null),
  ]);

  const items = groups.map(groupToItem);
  // Index items in queue order so the dashboard widget's "added" sort is
  // stable within a single instance.
  items.forEach((item, i) => {
    item.index = -i;
  });

  const remainingBytes = status
    ? combineHiLo(status.RemainingSizeHi, status.RemainingSizeLo)
    : 0;

  return {
    items,
    paused: status?.DownloadPaused ?? false,
    speedLabel: status ? formatSpeed(status.DownloadRate) : undefined,
    sizeLeftLabel: status && remainingBytes > 0 ? formatBytes(remainingBytes) : undefined,
  };
}

export const nzbgetAdapter: UsenetAdapter = {
  serviceId: "nzbget",
  displayName: "NZBGet",
  detailRoute: (id, instanceId) =>
    instanceId ? `/nzb/${id}?instanceId=${instanceId}` : `/nzb/${id}`,

  useQueue: (instanceId) => {
    const { instanceId: id, enabled } = useInstanceTarget("nzbget", instanceId);
    return useQuery({
      queryKey: ["nzbget", id, "queue"],
      queryFn: () => fetchQueueState(id ?? undefined),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
      enabled: enabled && !!id,
    });
  },

  queueQueryOptions: (instanceId) => ({
    queryKey: ["nzbget", instanceId, "queue"],
    queryFn: () => fetchQueueState(instanceId),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    // No `select` — fetchQueueState already returns UsenetQueueState. The
    // generic <unknown, Error, UsenetQueueState> shape from the adapter
    // interface keeps this working without an extra transform.
    select: (data) => data as UsenetQueueState,
  }),

  useHistory: (limit, instanceId) => {
    const { instanceId: id, enabled } = useInstanceTarget("nzbget", instanceId);
    return useQuery({
      queryKey: ["nzbget", id, "history", limit],
      queryFn: () => getNzbgetHistory(limit, id ?? undefined),
      refetchInterval: POLLING_INTERVALS.queue,
      enabled: enabled && !!id,
      select: (slots): UsenetHistoryState => ({
        items: slots.map(historyToItem),
      }),
    });
  },

  usePauseSlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: (nzbId: string) => pauseNzbgetGroup(Number(nzbId), id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  useResumeSlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: (nzbId: string) => resumeNzbgetGroup(Number(nzbId), id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  useDeleteSlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: ({ id: nzbId, deleteFiles = false }: { id: string; deleteFiles?: boolean }) =>
        deleteNzbgetGroup(Number(nzbId), deleteFiles, id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  useDeleteHistorySlot: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: ({ id: nzbId, deleteFiles = false }: { id: string; deleteFiles?: boolean }) =>
        deleteNzbgetHistorySlot(Number(nzbId), deleteFiles, id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  useAddUrl: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: ({ url, category }: { url: string; category?: string }) =>
        addNzbgetUrl(url, category, id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  useAddFile: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: async ({
        fileUri,
        fileName,
        category,
      }: {
        fileUri: string;
        fileName: string;
        category?: string;
      }) => {
        // NZBGet's append RPC takes the nzb as base64 text, not multipart.
        const content = await new File(fileUri).base64();
        return addNzbgetFile(fileName, content, category, id ?? undefined);
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  usePauseAll: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: () => pauseNzbgetAll(id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  useResumeAll: (instanceId) => {
    const queryClient = useQueryClient();
    const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
    return useMutation({
      mutationFn: () => resumeNzbgetAll(id ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
    });
  },

  SpeedLimitsControl: NzbgetSpeedLimitsControl,
};

// Suppress unused-export warning for NzbgetStatus — kept reachable for
// downstream consumers (e.g. detail screen) that may want the raw shape.
export type { NzbgetStatus };

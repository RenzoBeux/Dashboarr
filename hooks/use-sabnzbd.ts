import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getSabQueueSlot,
  getSabQueueSummary,
  getSabHistory,
  pauseSabAll,
  resumeSabAll,
  pauseSabSlot,
  resumeSabSlot,
  deleteSabSlot,
  deleteSabHistorySlot,
  addSabUrl,
  setSabSpeedLimit,
} from "@/services/sabnzbd-api";
import { cachedSabSlotIndex } from "@/lib/sab-queue-pages";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useServiceQuery, useServiceMutation } from "@/hooks/use-service-query";

// Per-instance cache keying: every hook accepts an optional `instanceId`.
// When omitted, the user's active SABnzbd is used (single-instance behavior);
// when passed (by aggregated dashboard cards or per-instance watchers), queries
// fan out to that specific instance with its own cache slot.

// One queued job for its detail screen, with the ETA the queue shows (#514):
// never the whole queue, and never an nzo_ids read, whose ETA leaves out the
// jobs ahead (see readSabSlot). The job's last index steers the next read; the
// first comes from the list's or the dashboard widget's cached pages.
export function useSabQueueSlot(nzoId: string, instanceId?: string) {
  const queryClient = useQueryClient();
  const near = useRef<number | undefined>(undefined);
  return useServiceQuery(
    "sabnzbd",
    ["queue", "slot", nzoId],
    async (id) => {
      const hint =
        near.current ??
        cachedSabSlotIndex(
          queryClient.getQueriesData({ queryKey: ["sabnzbd", id, "queue"] }),
          nzoId,
        );
      const queue = await getSabQueueSlot(nzoId, hint, id);
      const index = queue.slots[0]?.index;
      near.current = index !== undefined && index >= 0 ? index : undefined;
      return queue;
    },
    POLLING_INTERVALS.activeTorrents,
    instanceId,
  );
}

// Header fields only (speed, size left, pause state, speed limit): one job
// instead of the whole queue, which can be over a megabyte (#514).
export function useSabQueueSummary(instanceId?: string) {
  return useServiceQuery(
    "sabnzbd",
    ["queue", "summary"],
    getSabQueueSummary,
    POLLING_INTERVALS.activeTorrents,
    instanceId,
  );
}

export function useSabHistory(limit = 50, instanceId?: string, active = true) {
  return useServiceQuery(
    "sabnzbd",
    ["history", limit],
    (id) => getSabHistory(limit, id),
    POLLING_INTERVALS.queue,
    instanceId,
    active,
  );
}

export function usePauseSabSlot(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    (nzoId: string, id) => pauseSabSlot(nzoId, id),
    instanceId,
  );
}

export function useResumeSabSlot(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    (nzoId: string, id) => resumeSabSlot(nzoId, id),
    instanceId,
  );
}

export function useDeleteSabSlot(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    ({ nzoId, deleteFiles = false }: { nzoId: string; deleteFiles?: boolean }, id) =>
      deleteSabSlot(nzoId, deleteFiles, id),
    instanceId,
  );
}

export function useDeleteSabHistorySlot(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    ({ nzoId, deleteFiles = false }: { nzoId: string; deleteFiles?: boolean }, id) =>
      deleteSabHistorySlot(nzoId, deleteFiles, id),
    instanceId,
  );
}

export function usePauseSabAll(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    (_: void, id) => pauseSabAll(id),
    instanceId,
  );
}

export function useResumeSabAll(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    (_: void, id) => resumeSabAll(id),
    instanceId,
  );
}

export function useAddSabUrl(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    ({ url, category }: { url: string; category?: string }, id) =>
      addSabUrl(url, category, id),
    instanceId,
  );
}

// Set the download speed limit in KB/s (0 = unlimited). useServiceMutation
// invalidates the whole ["sabnzbd", id] slice on success, so the queue's
// `speedlimit_abs` (and the control's amber tint) refresh right after saving.
export function useSetSabSpeedLimit(instanceId?: string) {
  return useServiceMutation(
    "sabnzbd",
    (kbPerSec: number, id) => setSabSpeedLimit(kbPerSec, id),
    instanceId,
  );
}

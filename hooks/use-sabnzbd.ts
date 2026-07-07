import {
  getSabQueue,
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
import { POLLING_INTERVALS } from "@/lib/constants";
import { useServiceQuery, useServiceMutation } from "@/hooks/use-service-query";

// Per-instance cache keying: every hook accepts an optional `instanceId`.
// When omitted, the user's active SABnzbd is used (single-instance behavior);
// when passed (by aggregated dashboard cards or per-instance watchers), queries
// fan out to that specific instance with its own cache slot.

export function useSabQueue(instanceId?: string) {
  return useServiceQuery(
    "sabnzbd",
    ["queue"],
    getSabQueue,
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

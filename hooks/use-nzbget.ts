import {
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
  setNzbgetRate,
} from "@/services/nzbget-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useServiceQuery, useServiceMutation } from "@/hooks/use-service-query";

// Per-instance cache keying mirrors the SAB hooks: every hook accepts an
// optional `instanceId` so aggregated dashboard cards can fan a query out
// across every enabled NZBGet instance.

export function useNzbgetGroups(instanceId?: string) {
  return useServiceQuery(
    "nzbget",
    ["groups"],
    getNzbgetGroups,
    POLLING_INTERVALS.activeTorrents,
    instanceId,
  );
}

export function useNzbgetHistory(limit = 50, instanceId?: string, active = true) {
  return useServiceQuery(
    "nzbget",
    ["history", limit],
    (id) => getNzbgetHistory(limit, id),
    POLLING_INTERVALS.queue,
    instanceId,
    active,
  );
}

export function useNzbgetStatus(instanceId?: string) {
  return useServiceQuery(
    "nzbget",
    ["status"],
    getNzbgetStatus,
    POLLING_INTERVALS.activeTorrents,
    instanceId,
  );
}

export function usePauseNzbgetGroup(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    (nzbId: number, id) => pauseNzbgetGroup(nzbId, id),
    instanceId,
  );
}

export function useResumeNzbgetGroup(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    (nzbId: number, id) => resumeNzbgetGroup(nzbId, id),
    instanceId,
  );
}

export function useDeleteNzbgetGroup(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    ({ nzbId, deleteFiles = false }: { nzbId: number; deleteFiles?: boolean }, id) =>
      deleteNzbgetGroup(nzbId, deleteFiles, id),
    instanceId,
  );
}

export function useDeleteNzbgetHistorySlot(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    ({ nzbId, deleteFiles = false }: { nzbId: number; deleteFiles?: boolean }, id) =>
      deleteNzbgetHistorySlot(nzbId, deleteFiles, id),
    instanceId,
  );
}

export function usePauseNzbgetAll(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    (_: void, id) => pauseNzbgetAll(id),
    instanceId,
  );
}

export function useResumeNzbgetAll(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    (_: void, id) => resumeNzbgetAll(id),
    instanceId,
  );
}

export function useAddNzbgetUrl(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    ({ url, category }: { url: string; category?: string }, id) =>
      addNzbgetUrl(url, category, id),
    instanceId,
  );
}

// Set the download speed limit in KB/s (0 = unlimited). Invalidates the
// ["nzbget", id] slice so `status.DownloadLimit` (and the control tint) refresh.
export function useSetNzbgetRate(instanceId?: string) {
  return useServiceMutation(
    "nzbget",
    (kbPerSec: number, id) => setNzbgetRate(kbPerSec, id),
    instanceId,
  );
}

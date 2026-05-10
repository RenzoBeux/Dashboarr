import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "@/services/sabnzbd-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Per-instance cache keying: every hook accepts an optional `instanceId`.
// When omitted, the user's active SABnzbd is used (single-instance behavior);
// when passed (by aggregated dashboard cards or per-instance watchers), queries
// fan out to that specific instance with its own cache slot.

export function useSabQueue(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sabnzbd", instanceId);
  return useQuery({
    queryKey: ["sabnzbd", id, "queue"],
    queryFn: () => getSabQueue(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id,
  });
}

export function useSabHistory(limit = 50, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("sabnzbd", instanceId);
  return useQuery({
    queryKey: ["sabnzbd", id, "history", limit],
    queryFn: () => getSabHistory(limit, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function usePauseSabSlot(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
  return useMutation({
    mutationFn: (nzoId: string) => pauseSabSlot(nzoId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] });
    },
  });
}

export function useResumeSabSlot(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
  return useMutation({
    mutationFn: (nzoId: string) => resumeSabSlot(nzoId, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] });
    },
  });
}

export function useDeleteSabSlot(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
  return useMutation({
    mutationFn: ({
      nzoId,
      deleteFiles = false,
    }: {
      nzoId: string;
      deleteFiles?: boolean;
    }) => deleteSabSlot(nzoId, deleteFiles, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] });
    },
  });
}

export function useDeleteSabHistorySlot(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
  return useMutation({
    mutationFn: ({
      nzoId,
      deleteFiles = false,
    }: {
      nzoId: string;
      deleteFiles?: boolean;
    }) => deleteSabHistorySlot(nzoId, deleteFiles, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] });
    },
  });
}

export function usePauseSabAll(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
  return useMutation({
    mutationFn: () => pauseSabAll(id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] });
    },
  });
}

export function useResumeSabAll(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
  return useMutation({
    mutationFn: () => resumeSabAll(id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] });
    },
  });
}

export function useAddSabUrl(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("sabnzbd", instanceId);
  return useMutation({
    mutationFn: ({ url, category }: { url: string; category?: string }) =>
      addSabUrl(url, category, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd", id] });
    },
  });
}

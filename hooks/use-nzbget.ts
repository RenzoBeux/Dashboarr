import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "@/services/nzbget-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Per-instance cache keying mirrors the SAB hooks: every hook accepts an
// optional `instanceId` so aggregated dashboard cards can fan a query out
// across every enabled NZBGet instance.

export function useNzbgetGroups(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("nzbget", instanceId);
  return useQuery({
    queryKey: ["nzbget", id, "groups"],
    queryFn: () => getNzbgetGroups(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id,
  });
}

export function useNzbgetHistory(limit = 50, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("nzbget", instanceId);
  return useQuery({
    queryKey: ["nzbget", id, "history", limit],
    queryFn: () => getNzbgetHistory(limit, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useNzbgetStatus(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("nzbget", instanceId);
  return useQuery({
    queryKey: ["nzbget", id, "status"],
    queryFn: () => getNzbgetStatus(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id,
  });
}

export function usePauseNzbgetGroup(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
  return useMutation({
    mutationFn: (nzbId: number) => pauseNzbgetGroup(nzbId, id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
  });
}

export function useResumeNzbgetGroup(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
  return useMutation({
    mutationFn: (nzbId: number) => resumeNzbgetGroup(nzbId, id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
  });
}

export function useDeleteNzbgetGroup(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
  return useMutation({
    mutationFn: ({
      nzbId,
      deleteFiles = false,
    }: {
      nzbId: number;
      deleteFiles?: boolean;
    }) => deleteNzbgetGroup(nzbId, deleteFiles, id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
  });
}

export function useDeleteNzbgetHistorySlot(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
  return useMutation({
    mutationFn: ({
      nzbId,
      deleteFiles = false,
    }: {
      nzbId: number;
      deleteFiles?: boolean;
    }) => deleteNzbgetHistorySlot(nzbId, deleteFiles, id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
  });
}

export function usePauseNzbgetAll(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
  return useMutation({
    mutationFn: () => pauseNzbgetAll(id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
  });
}

export function useResumeNzbgetAll(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
  return useMutation({
    mutationFn: () => resumeNzbgetAll(id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
  });
}

export function useAddNzbgetUrl(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("nzbget", instanceId);
  return useMutation({
    mutationFn: ({ url, category }: { url: string; category?: string }) =>
      addNzbgetUrl(url, category, id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nzbget", id] }),
  });
}

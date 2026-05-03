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
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useSabEnabled() {
  return useConfigStore((s) => s.services.sabnzbd.enabled);
}

export function useSabQueue() {
  const enabled = useSabEnabled();
  return useQuery({
    queryKey: ["sabnzbd", "queue"],
    queryFn: getSabQueue,
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled,
  });
}

export function useSabHistory(limit = 50) {
  const enabled = useSabEnabled();
  return useQuery({
    queryKey: ["sabnzbd", "history", limit],
    queryFn: () => getSabHistory(limit),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled,
  });
}

export function usePauseSabSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nzoId: string) => pauseSabSlot(nzoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd"] });
    },
  });
}

export function useResumeSabSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nzoId: string) => resumeSabSlot(nzoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd"] });
    },
  });
}

export function useDeleteSabSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      nzoId,
      deleteFiles = false,
    }: {
      nzoId: string;
      deleteFiles?: boolean;
    }) => deleteSabSlot(nzoId, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd"] });
    },
  });
}

export function useDeleteSabHistorySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      nzoId,
      deleteFiles = false,
    }: {
      nzoId: string;
      deleteFiles?: boolean;
    }) => deleteSabHistorySlot(nzoId, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd"] });
    },
  });
}

export function usePauseSabAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pauseSabAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd"] });
    },
  });
}

export function useResumeSabAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resumeSabAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd"] });
    },
  });
}

export function useAddSabUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ url, category }: { url: string; category?: string }) =>
      addSabUrl(url, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sabnzbd"] });
    },
  });
}

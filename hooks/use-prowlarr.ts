import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIndexers,
  getIndexerStatuses,
  getIndexerStats,
  searchAll,
  toggleIndexer,
  grabRelease,
} from "@/services/prowlarr-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import type { ProwlarrIndexer } from "@/lib/types";
import { useInstanceTarget } from "@/hooks/use-instance-target";

export function useProwlarrIndexers(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("prowlarr", instanceId);
  return useQuery({
    queryKey: ["prowlarr", id, "indexers"],
    queryFn: () => getIndexers(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useProwlarrIndexerStatuses(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("prowlarr", instanceId);
  return useQuery({
    queryKey: ["prowlarr", id, "indexerStatuses"],
    queryFn: () => getIndexerStatuses(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.serviceHealth,
    enabled: enabled && !!id,
  });
}

export function useProwlarrStats(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("prowlarr", instanceId);
  return useQuery({
    queryKey: ["prowlarr", id, "stats"],
    queryFn: () => getIndexerStats(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
  });
}

export function useProwlarrSearch(
  query: string,
  indexerIds?: number[],
  instanceId?: string,
) {
  const { instanceId: id } = useInstanceTarget("prowlarr", instanceId);
  return useQuery({
    queryKey: ["prowlarr", id, "search", query, indexerIds],
    queryFn: () => searchAll(query, indexerIds, undefined, id ?? undefined),
    enabled: query.length >= 2 && !!id,
  });
}

export function useToggleIndexer(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("prowlarr", instanceId);
  return useMutation({
    mutationFn: ({ indexer, enable }: { indexer: ProwlarrIndexer; enable: boolean }) =>
      toggleIndexer(indexer, enable, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prowlarr", id, "indexers"] });
    },
  });
}

export function useGrabRelease(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("prowlarr", instanceId);
  return useMutation({
    mutationFn: ({ guid, indexerId }: { guid: string; indexerId: number }) =>
      grabRelease(guid, indexerId, id ?? undefined),
  });
}

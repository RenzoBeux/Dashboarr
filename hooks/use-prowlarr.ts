import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIndexers,
  getIndexerStatuses,
  getIndexerStats,
  searchAll,
  toggleIndexer,
  grabRelease,
} from "@/services/prowlarr-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";
import type { ProwlarrIndexer } from "@/lib/types";

function useProwlarrEnabled() {
  return useConfigStore((s) => s.services.prowlarr.enabled);
}

export function useProwlarrIndexers() {
  const enabled = useProwlarrEnabled();
  return useQuery({
    queryKey: ["prowlarr", "indexers"],
    queryFn: getIndexers,
    enabled,
  });
}

export function useProwlarrIndexerStatuses() {
  const enabled = useProwlarrEnabled();
  return useQuery({
    queryKey: ["prowlarr", "indexerStatuses"],
    queryFn: getIndexerStatuses,
    refetchInterval: POLLING_INTERVALS.serviceHealth,
    enabled,
  });
}

export function useProwlarrStats() {
  const enabled = useProwlarrEnabled();
  return useQuery({
    queryKey: ["prowlarr", "stats"],
    queryFn: getIndexerStats,
    enabled,
    staleTime: 300000,
  });
}

export function useProwlarrSearch(query: string, indexerIds?: number[]) {
  return useQuery({
    queryKey: ["prowlarr", "search", query, indexerIds],
    queryFn: () => searchAll(query, indexerIds),
    enabled: query.length >= 2,
  });
}

export function useToggleIndexer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ indexer, enable }: { indexer: ProwlarrIndexer; enable: boolean }) =>
      toggleIndexer(indexer, enable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prowlarr", "indexers"] });
    },
  });
}

export function useGrabRelease() {
  return useMutation({
    mutationFn: ({ guid, indexerId }: { guid: string; indexerId: number }) =>
      grabRelease(guid, indexerId),
  });
}

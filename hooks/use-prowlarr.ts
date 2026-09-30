import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIndexers,
  getIndexerStatuses,
  getIndexerStats,
  testIndexer,
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

// Release search lives in lib/indexer-adapters/prowlarr.ts, not here — it needs
// the abort/retry/timeout contract the shared ReleaseSearch view relies on.

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

// Per-indexer test (#447). The verdict itself is transient row state in the
// list, but unlike Jackett's probe this one has a server-side effect: Prowlarr
// records the outcome in /indexerstatus (a pass clears a backoff, a fail starts
// one), so statuses are refetched either way. Drive it through
// useIndexerTestRunner (one `mutateAsync` per row): `isPending`/`variables`
// only track the latest call, so they can't tell two overlapping rows apart.
//
// The target instance travels in the variables instead of being read from the
// hook's closure: TanStack re-applies a pending mutation's options on every
// render, so a closure-read id would follow an instance switch made mid-flight
// and invalidate the wrong server's statuses. `instanceId` is the list's
// useInstanceTarget value, null-typed to match the query key.
export function useTestProwlarrIndexer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      indexer,
      instanceId,
    }: {
      indexer: ProwlarrIndexer;
      instanceId: string | null;
    }) => testIndexer(indexer, instanceId ?? undefined),
    onSettled: (_data, _error, { instanceId }) => {
      queryClient.invalidateQueries({
        queryKey: ["prowlarr", instanceId, "indexerStatuses"],
      });
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

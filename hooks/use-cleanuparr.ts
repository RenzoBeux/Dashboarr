import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { getEvents, getJobs, getStats, triggerJob } from "@/services/cleanuparr-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useServiceMutation, useServiceQuery } from "@/hooks/use-service-query";
import type { CleanuparrJobType } from "@/lib/types";

// Direct useQuery rather than useServiceQuery: the timeframe belongs in the
// cache key, which the wrapper can't express. Stats move on job cadence
// (Cleanuparr's jobs run on multi-minute schedules), so a minute is plenty.
export function useCleanuparrStats(hours: number, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("cleanuparr", instanceId);
  return useQuery({
    queryKey: ["cleanuparr", id, "stats", hours],
    queryFn: () => getStats(hours, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

export function useCleanuparrJobs(instanceId?: string) {
  return useServiceQuery("cleanuparr", ["jobs"], getJobs, 30000, instanceId);
}

export function useCleanuparrEvents(severity?: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("cleanuparr", instanceId);
  return useInfiniteQuery({
    queryKey: ["cleanuparr", id, "events", severity ?? "all"],
    queryFn: ({ pageParam }) =>
      getEvents({ page: pageParam, pageSize: 25, severity }, id ?? undefined),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: enabled && !!id,
    staleTime: 30000,
  });
}

export function useTriggerCleanuparrJob(instanceId?: string) {
  return useServiceMutation(
    "cleanuparr",
    (jobType: CleanuparrJobType, id) => triggerJob(jobType, id),
    instanceId,
  );
}

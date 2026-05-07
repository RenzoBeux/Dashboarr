import { useQuery } from "@tanstack/react-query";
import { getActivity, getHistory, getLibraryStats } from "@/services/tautulli-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

export function useTautulliActivity(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("tautulli", instanceId);
  return useQuery({
    queryKey: ["tautulli", id, "activity"],
    queryFn: () => getActivity(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s — active streams need fast updates
    enabled: enabled && !!id,
  });
}

export function useTautulliHistory(length = 20, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("tautulli", instanceId);
  return useQuery({
    queryKey: ["tautulli", id, "history", length],
    queryFn: () => getHistory(length, 0, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar, // 60s
    enabled: enabled && !!id,
  });
}

export function useTautulliLibraryStats(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("tautulli", instanceId);
  return useQuery({
    queryKey: ["tautulli", id, "libraryStats"],
    queryFn: () => getLibraryStats(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000, // 5 min — library sizes don't change fast
  });
}

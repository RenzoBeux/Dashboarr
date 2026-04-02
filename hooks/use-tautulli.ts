import { useQuery } from "@tanstack/react-query";
import { getActivity, getHistory, getLibraryStats } from "@/services/tautulli-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useTautulliEnabled() {
  return useConfigStore((s) => s.services.tautulli.enabled);
}

export function useTautulliActivity() {
  const enabled = useTautulliEnabled();
  return useQuery({
    queryKey: ["tautulli", "activity"],
    queryFn: getActivity,
    refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s — active streams need fast updates
    enabled,
  });
}

export function useTautulliHistory(length = 20) {
  const enabled = useTautulliEnabled();
  return useQuery({
    queryKey: ["tautulli", "history", length],
    queryFn: () => getHistory(length),
    refetchInterval: POLLING_INTERVALS.calendar, // 60s
    enabled,
  });
}

export function useTautulliLibraryStats() {
  const enabled = useTautulliEnabled();
  return useQuery({
    queryKey: ["tautulli", "libraryStats"],
    queryFn: getLibraryStats,
    enabled,
    staleTime: 300000, // 5 min — library sizes don't change fast
  });
}

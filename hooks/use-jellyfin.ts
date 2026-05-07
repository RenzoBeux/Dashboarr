import { useQuery } from "@tanstack/react-query";
import {
  getLibraries,
  getRecentlyAdded,
  getResumeItems,
  getSessions,
  resolveUserId,
} from "@/services/jellyfin-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Resolves the userId tied to the configured API key. User-scoped queries
// gate on this so they don't fire with an undefined user. Cached for 5min —
// the binding rarely changes within a session.
export function useJellyfinUserId(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("jellyfin", instanceId);
  return useQuery({
    queryKey: ["jellyfin", id, "userId"],
    queryFn: () => resolveUserId(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
    gcTime: 600000,
  });
}

export function useJellyfinLibraries(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("jellyfin", instanceId);
  const { data: userId } = useJellyfinUserId(instanceId);
  return useQuery({
    queryKey: ["jellyfin", id, "libraries", userId],
    queryFn: () => getLibraries(userId!, id ?? undefined),
    enabled: enabled && !!userId && !!id,
    staleTime: 300000,
  });
}

export function useJellyfinRecentlyAdded(
  parentId?: string,
  count = 20,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("jellyfin", instanceId);
  const { data: userId } = useJellyfinUserId(instanceId);
  return useQuery({
    queryKey: ["jellyfin", id, "recentlyAdded", userId, parentId ?? null],
    queryFn: () => getRecentlyAdded(userId!, parentId, count, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!userId && !!id,
  });
}

export function useJellyfinResumeItems(count = 20, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("jellyfin", instanceId);
  const { data: userId } = useJellyfinUserId(instanceId);
  return useQuery({
    queryKey: ["jellyfin", id, "resume", userId],
    queryFn: () => getResumeItems(userId!, count, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!userId && !!id,
  });
}

export function useJellyfinSessions(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("jellyfin", instanceId);
  return useQuery({
    queryKey: ["jellyfin", id, "sessions"],
    queryFn: () => getSessions(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s — same cadence as Plex now-playing
    enabled: enabled && !!id,
  });
}

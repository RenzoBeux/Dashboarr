import { useQuery } from "@tanstack/react-query";
import {
  getLibraries,
  getRecentlyAdded,
  getResumeItems,
  getSessions,
  resolveUserId,
} from "@/services/jellyfin-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

export function useJellyfinEnabled() {
  return useConfigStore((s) => s.services.jellyfin.enabled);
}

// Resolves the userId tied to the configured API key. User-scoped queries
// gate on this so they don't fire with an undefined user. Cached for 5min —
// the binding rarely changes within a session.
export function useJellyfinUserId() {
  const enabled = useJellyfinEnabled();
  return useQuery({
    queryKey: ["jellyfin", "userId"],
    queryFn: resolveUserId,
    enabled,
    staleTime: 300000,
    gcTime: 600000,
  });
}

export function useJellyfinLibraries() {
  const enabled = useJellyfinEnabled();
  const { data: userId } = useJellyfinUserId();
  return useQuery({
    queryKey: ["jellyfin", "libraries", userId],
    queryFn: () => getLibraries(userId!),
    enabled: enabled && !!userId,
    staleTime: 300000,
  });
}

export function useJellyfinRecentlyAdded(parentId?: string, count = 20) {
  const enabled = useJellyfinEnabled();
  const { data: userId } = useJellyfinUserId();
  return useQuery({
    queryKey: ["jellyfin", "recentlyAdded", userId, parentId ?? null],
    queryFn: () => getRecentlyAdded(userId!, parentId, count),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!userId,
  });
}

export function useJellyfinResumeItems(count = 20) {
  const enabled = useJellyfinEnabled();
  const { data: userId } = useJellyfinUserId();
  return useQuery({
    queryKey: ["jellyfin", "resume", userId],
    queryFn: () => getResumeItems(userId!, count),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!userId,
  });
}

export function useJellyfinSessions() {
  const enabled = useJellyfinEnabled();
  return useQuery({
    queryKey: ["jellyfin", "sessions"],
    queryFn: getSessions,
    refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s — same cadence as Plex now-playing
    enabled,
  });
}

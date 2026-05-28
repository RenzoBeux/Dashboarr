import { useQuery } from "@tanstack/react-query";
import {
  getLibraries,
  getRecentlyAdded,
  getResumeItems,
  getSessions,
  resolveUserId,
} from "@/services/jellyfin-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import type { MediaServerId } from "@/lib/media-server-config";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Jellyfin and Emby share one API; this factory stamps a hook set for a given
// kind so each gets distinct query keys (`[serviceId, …]`) and instance gating.
// Instantiate once per kind at module scope (see use-jellyfin.ts / use-emby.ts)
// rather than calling it during render — the serviceId is fixed per kind.
export function createMediaServerHooks(serviceId: MediaServerId) {
  // Resolves the userId tied to the configured API key. User-scoped queries
  // gate on this so they don't fire with an undefined user. Cached for 5min —
  // the binding rarely changes within a session.
  function useUserId(instanceId?: string) {
    const { instanceId: id, enabled } = useInstanceTarget(serviceId, instanceId);
    return useQuery({
      queryKey: [serviceId, id, "userId"],
      queryFn: () => resolveUserId(id ?? undefined, serviceId),
      enabled: enabled && !!id,
      staleTime: 300000,
      gcTime: 600000,
    });
  }

  function useLibraries(instanceId?: string) {
    const { instanceId: id, enabled } = useInstanceTarget(serviceId, instanceId);
    const { data: userId } = useUserId(instanceId);
    return useQuery({
      queryKey: [serviceId, id, "libraries", userId],
      queryFn: () => getLibraries(userId!, id ?? undefined, serviceId),
      enabled: enabled && !!userId && !!id,
      staleTime: 300000,
    });
  }

  function useRecentlyAdded(parentId?: string, count = 20, instanceId?: string) {
    const { instanceId: id, enabled } = useInstanceTarget(serviceId, instanceId);
    const { data: userId } = useUserId(instanceId);
    return useQuery({
      queryKey: [serviceId, id, "recentlyAdded", userId, parentId ?? null],
      queryFn: () => getRecentlyAdded(userId!, parentId, count, id ?? undefined, serviceId),
      refetchInterval: POLLING_INTERVALS.calendar,
      enabled: enabled && !!userId && !!id,
    });
  }

  function useResumeItems(count = 20, instanceId?: string) {
    const { instanceId: id, enabled } = useInstanceTarget(serviceId, instanceId);
    const { data: userId } = useUserId(instanceId);
    return useQuery({
      queryKey: [serviceId, id, "resume", userId],
      queryFn: () => getResumeItems(userId!, count, id ?? undefined, serviceId),
      refetchInterval: POLLING_INTERVALS.calendar,
      enabled: enabled && !!userId && !!id,
    });
  }

  function useSessions(instanceId?: string) {
    const { instanceId: id, enabled } = useInstanceTarget(serviceId, instanceId);
    return useQuery({
      queryKey: [serviceId, id, "sessions"],
      queryFn: () => getSessions(id ?? undefined, serviceId),
      refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s — same cadence as Plex now-playing
      enabled: enabled && !!id,
    });
  }

  return { useUserId, useLibraries, useRecentlyAdded, useResumeItems, useSessions };
}

export type MediaServerHooks = ReturnType<typeof createMediaServerHooks>;

import { useQuery } from "@tanstack/react-query";
import {
  getLibraries,
  getLibraryContents,
  getRecentlyAdded,
  getOnDeck,
  getSessions,
  getMetadata,
} from "@/services/plex-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

export function usePlexLibraries(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "libraries"],
    queryFn: () => getLibraries(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300000,
  });
}

export function usePlexLibraryContents(
  sectionKey: string,
  start = 0,
  size = 50,
  instanceId?: string,
) {
  const { instanceId: id } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "library", sectionKey, start, size],
    queryFn: () => getLibraryContents(sectionKey, start, size, id ?? undefined),
    enabled: !!sectionKey && !!id,
  });
}

export function usePlexRecentlyAdded(
  sectionKey?: string,
  count = 20,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "recentlyAdded", sectionKey],
    queryFn: () => getRecentlyAdded(sectionKey, count, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!id,
  });
}

export function usePlexOnDeck(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "onDeck"],
    queryFn: () => getOnDeck(20, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled: enabled && !!id,
  });
}

export function usePlexSessions(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "sessions"],
    queryFn: () => getSessions(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s
    enabled: enabled && !!id,
  });
}

export function usePlexMetadata(ratingKey: string, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "metadata", ratingKey],
    queryFn: () => getMetadata(ratingKey, id ?? undefined),
    enabled: !!ratingKey && !!id,
  });
}

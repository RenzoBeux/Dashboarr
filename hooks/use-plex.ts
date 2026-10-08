import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getLibraries,
  getLibraryContents,
  getRecentlyAdded,
  getOnDeck,
  getSessions,
  getMetadata,
  getChildren,
  getMachineIdentifier,
} from "@/services/plex-api";
import { POLLING_INTERVALS } from "@/lib/constants";
import { plexLibraryNextOffset } from "@/lib/plex-items";
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

const PLEX_LIBRARY_PAGE_SIZE = 60;

// Pages through a library section (see plexLibraryNextOffset for when it stops).
export function usePlexLibraryContents(sectionKey: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useInfiniteQuery({
    queryKey: ["plex", id, "library", sectionKey],
    queryFn: ({ pageParam }) =>
      getLibraryContents(sectionKey, pageParam, PLEX_LIBRARY_PAGE_SIZE, id ?? undefined),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => plexLibraryNextOffset(lastPage, allPages),
    enabled: enabled && !!sectionKey && !!id,
    staleTime: 60000,
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
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "metadata", ratingKey],
    queryFn: () => getMetadata(ratingKey, id ?? undefined),
    enabled: enabled && !!ratingKey && !!id,
  });
}

export function usePlexChildren(
  ratingKey: string,
  hasChildren: boolean,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "children", ratingKey],
    queryFn: () => getChildren(ratingKey, id ?? undefined),
    enabled: enabled && hasChildren && !!ratingKey && !!id,
  });
}

// Never changes for a given server, so it is fetched once per instance.
export function usePlexMachineIdentifier(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("plex", instanceId);
  return useQuery({
    queryKey: ["plex", id, "machineIdentifier"],
    queryFn: () => getMachineIdentifier(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

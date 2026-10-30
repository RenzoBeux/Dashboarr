import { useInfiniteQuery } from "@tanstack/react-query";

import {
  excludeFromCollection,
  getCollectionMedia,
  getCollections,
  getHealth,
  getVersion,
} from "@/services/maintainerr-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useServiceMutation, useServiceQuery } from "@/hooks/use-service-query";

// Collections carry mediaCount inline, so a single call powers both the list
// and the overview totals. A minute matches Maintainerr's own handler cadence.
export function useMaintainerrCollections(instanceId?: string) {
  return useServiceQuery("maintainerr", ["collections"], (id) => getCollections(id), 60_000, instanceId);
}

// The database/liveness detail behind the offline dot (surfaces a "degraded"
// banner when the app is up but its database is unreachable).
export function useMaintainerrHealth(instanceId?: string) {
  return useServiceQuery("maintainerr", ["health"], (id) => getHealth(id), 60_000, instanceId);
}

// Version + update-available banner; it changes rarely, so refetch on a long beat.
export function useMaintainerrVersion(instanceId?: string) {
  return useServiceQuery("maintainerr", ["version"], (id) => getVersion(id), 1_800_000, instanceId);
}

const COLLECTION_MEDIA_PAGE_SIZE = 25;

// A collection's members, paged. Each page joins media-server metadata
// server-side (one lookup per item), so pages stay small and load on demand.
// The key sits under ["maintainerr", id] so an exclusion's invalidation
// refreshes it alongside the collection counts.
export function useMaintainerrCollectionMedia(collectionId: number, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("maintainerr", instanceId);
  return useInfiniteQuery({
    queryKey: ["maintainerr", id, "collection-media", collectionId],
    queryFn: ({ pageParam }) =>
      getCollectionMedia(collectionId, pageParam, COLLECTION_MEDIA_PAGE_SIZE, id ?? undefined),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * COLLECTION_MEDIA_PAGE_SIZE < lastPage.totalSize ? allPages.length + 1 : undefined,
    enabled: enabled && !!id && Number.isFinite(collectionId),
    staleTime: 30_000,
  });
}

export function useExcludeMaintainerrMedia(instanceId?: string) {
  return useServiceMutation(
    "maintainerr",
    ({ collectionId, mediaServerId }: { collectionId: number; mediaServerId: string }, id) =>
      excludeFromCollection(collectionId, mediaServerId, id),
    instanceId,
  );
}

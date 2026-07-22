import { useQuery } from "@tanstack/react-query";

import { getIndexers, searchAll } from "@/services/jackett-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";

export function useJackettIndexers(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("jackett", instanceId);
  return useQuery({
    queryKey: ["jackett", id, "indexers"],
    queryFn: () => getIndexers(id ?? undefined),
    enabled: enabled && !!id,
    // The configured-indexer set changes only when the user edits Jackett
    // itself — same 5-minute staleness Prowlarr stats use.
    staleTime: 300000,
  });
}

export function useJackettSearch(query: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("jackett", instanceId);
  return useQuery({
    queryKey: ["jackett", id, "search", query],
    queryFn: () => searchAll(query, id ?? undefined),
    enabled: enabled && query.length >= 2 && !!id,
  });
}

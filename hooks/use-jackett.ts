import { useMutation, useQuery } from "@tanstack/react-query";

import { getIndexers, testIndexer } from "@/services/jackett-api";
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

// Per-indexer test (#315). Nothing is cached or invalidated: a test is a probe
// the user explicitly asked for, and its result is transient row state in the
// list. `variables` tells the caller which row is currently in flight.
export function useTestJackettIndexer(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("jackett", instanceId);
  return useMutation({
    mutationFn: (indexerId: string) => testIndexer(indexerId, id ?? undefined),
  });
}

// Release search lives in lib/indexer-adapters/jackett.ts, not here — it needs
// the abort/retry/timeout contract the shared ReleaseSearch view relies on.

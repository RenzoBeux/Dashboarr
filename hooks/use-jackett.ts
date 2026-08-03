import { useQuery } from "@tanstack/react-query";

import { getIndexers } from "@/services/jackett-api";
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

// Release search lives in lib/indexer-adapters/jackett.ts, not here — it needs
// the abort/retry/timeout contract the shared ReleaseSearch view relies on.

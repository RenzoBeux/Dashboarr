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
// list. Drive it through useIndexerTestRunner (one `mutateAsync` per row):
// `isPending`/`variables` only track the latest call, so they can't tell two
// overlapping rows apart. The target instance travels in the variables, pinned
// at call time, for the reason given on useTestProwlarrIndexer.
export function useTestJackettIndexer() {
  return useMutation({
    mutationFn: ({
      indexerId,
      instanceId,
    }: {
      indexerId: string;
      instanceId: string | null;
    }) => testIndexer(indexerId, instanceId ?? undefined),
  });
}

// Release search lives in lib/indexer-adapters/jackett.ts, not here — it needs
// the abort/retry/timeout contract the shared ReleaseSearch view relies on.

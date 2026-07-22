import { useQuery } from "@tanstack/react-query";

import { searchAll } from "@/services/prowlarr-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { ProwlarrGrabFlow } from "@/components/indexers/prowlarr-grab-flow";
import type { IndexerSearchAdapter, UnifiedRelease } from "@/lib/indexer-adapter";
import type { ProwlarrSearchResult } from "@/lib/types";

function prowlarrToUnified(r: ProwlarrSearchResult): UnifiedRelease {
  return {
    id: r.guid,
    title: r.title,
    indexer: r.indexer,
    sizeBytes: r.size,
    seeders: r.seeders,
    leechers: r.leechers,
    protocol: r.protocol,
    magnetUrl: r.magnetUrl,
    downloadUrl: r.downloadUrl,
    infoUrl: r.infoUrl,
    grab: { guid: r.guid, indexerId: r.indexerId },
  };
}

export const prowlarrIndexerAdapter: IndexerSearchAdapter = {
  serviceId: "prowlarr",
  displayName: "Prowlarr",

  // Same queryKey shape as useProwlarrSearch (trailing undefined = no indexer
  // filter) so both surfaces share one cache entry; `select` maps to the
  // unified shape without touching the cached raw results.
  useSearch: (query: string, instanceId?: string) => {
    const { instanceId: id, enabled } = useInstanceTarget("prowlarr", instanceId);
    return useQuery({
      queryKey: ["prowlarr", id, "search", query, undefined],
      queryFn: () => searchAll(query, undefined, undefined, id ?? undefined),
      enabled: enabled && query.length >= 2 && !!id,
      select: (results: ProwlarrSearchResult[]) => results.map(prowlarrToUnified),
    });
  },

  GrabFlow: ProwlarrGrabFlow,
};

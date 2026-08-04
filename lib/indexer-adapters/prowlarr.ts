import { useQuery } from "@tanstack/react-query";

import { searchAll } from "@/services/prowlarr-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { ProwlarrGrabFlow } from "@/components/indexers/prowlarr-grab-flow";
import type {
  IndexerSearchAdapter,
  IndexerSearchOptions,
  UnifiedRelease,
} from "@/lib/indexer-adapter";
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

  // The trailing `indexerId` in the queryKey is the indexer filter, so a
  // filtered search can never collide with an unfiltered one; `select` maps
  // to the unified shape without touching the cached raw results.
  //
  // Interactive indexer searches are slow and expensive: don't auto-retry a
  // transient failure (it multiplies a 90s timeout by three before the user
  // sees anything), consume the queryFn signal so backing out aborts the
  // in-flight fetch, and cache a completed search long enough that returning
  // to the tab doesn't re-run it. Same contract as useRadarrReleases (#290).
  useSearch: (query: string, opts?: IndexerSearchOptions) => {
    const { instanceId: id, enabled } = useInstanceTarget("prowlarr", opts?.instanceId);
    const indexerId = opts?.indexerId;
    return useQuery({
      queryKey: ["prowlarr", id, "search", query, indexerId],
      queryFn: ({ signal }) =>
        searchAll(
          query,
          indexerId ? [Number(indexerId)] : undefined,
          undefined,
          id ?? undefined,
          signal,
        ),
      enabled: enabled && query.length >= 2 && !!id,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: false,
      select: (results: ProwlarrSearchResult[]) => results.map(prowlarrToUnified),
    });
  },

  GrabFlow: ProwlarrGrabFlow,
};

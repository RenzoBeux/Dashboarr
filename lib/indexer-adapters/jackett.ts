import { useQuery } from "@tanstack/react-query";

import { searchAll } from "@/services/jackett-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { JackettGrabFlow } from "@/components/indexers/jackett-grab-flow";
import type { IndexerSearchAdapter, UnifiedRelease } from "@/lib/indexer-adapter";
import type { JackettRelease, JackettResultsResponse } from "@/lib/types";

function jackettToUnified(r: JackettRelease): UnifiedRelease {
  return {
    // Guid alone isn't unique across trackers (some report bare info-hashes).
    id: `${r.TrackerId}:${r.Guid}`,
    title: r.Title,
    indexer: r.Tracker,
    sizeBytes: r.Size ?? 0,
    seeders: r.Seeders ?? undefined,
    leechers: r.Peers ?? undefined,
    // Jackett proxies torrent trackers exclusively.
    protocol: "torrent",
    magnetUrl: r.MagnetUri ?? undefined,
    downloadUrl: r.Link ?? undefined,
    infoUrl: r.Details ?? undefined,
  };
}

export const jackettIndexerAdapter: IndexerSearchAdapter = {
  serviceId: "jackett",
  displayName: "Jackett",

  // Interactive indexer searches are slow and expensive: don't auto-retry a
  // transient failure (it multiplies a 90s timeout by three before the user
  // sees anything), consume the queryFn signal so backing out aborts the
  // in-flight fetch, and cache a completed search long enough that returning
  // to the tab doesn't re-run it. Same contract as useRadarrReleases (#290).
  useSearch: (query: string, instanceId?: string) => {
    const { instanceId: id, enabled } = useInstanceTarget("jackett", instanceId);
    return useQuery({
      queryKey: ["jackett", id, "search", query],
      queryFn: ({ signal }) => searchAll(query, id ?? undefined, signal),
      enabled: enabled && query.length >= 2 && !!id,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: false,
      // Jackett returns results in per-tracker arrival order and the UI slices
      // the top of the list, so sorting by seeders is load-bearing.
      select: (resp: JackettResultsResponse) =>
        resp.Results.map(jackettToUnified).sort(
          (a, b) => (b.seeders ?? -1) - (a.seeders ?? -1),
        ),
    });
  },

  GrabFlow: JackettGrabFlow,
};

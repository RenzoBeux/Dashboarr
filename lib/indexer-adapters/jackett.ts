import { useQueries, useQuery } from "@tanstack/react-query";

import { getIndexers, searchIndexer } from "@/services/jackett-api";
import { isAbortError } from "@/lib/http-client";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { JackettGrabFlow } from "@/components/indexers/jackett-grab-flow";
import {
  combineIndexerSearches,
  type IndexerSearchSlice,
} from "@/lib/indexer-adapters/jackett-fanout";
import type {
  IndexerSearchAdapter,
  IndexerSearchOptions,
  IndexerSearchState,
  UnifiedRelease,
} from "@/lib/indexer-adapter";
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

const IDLE: IndexerSearchState = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
};

export const jackettIndexerAdapter: IndexerSearchAdapter = {
  serviceId: "jackett",
  displayName: "Jackett",

  // Interactive indexer searches are slow and expensive: don't auto-retry a
  // transient failure (it multiplies a 90s timeout by three before the user
  // sees anything), consume the queryFn signal so backing out aborts the
  // in-flight fetches, and cache a completed search long enough that returning
  // to the tab doesn't re-run it. Same contract as useRadarrReleases (#290).
  //
  // The all-indexers search fans out ONE request per configured indexer
  // instead of hitting Jackett's `all` meta-indexer: `all` responds only after
  // the slowest tracker finishes (Task.WhenAll in ResultsController, no
  // server-side timeout), so one hung tracker used to drag the aggregate past
  // 90s and abort the whole search (#314). Fanned out, each tracker gets its
  // own timeout, results merge as they arrive, and a stalled tracker only
  // loses its own rows.
  useSearch: (query: string, opts?: IndexerSearchOptions): IndexerSearchState => {
    const { instanceId: id, enabled } = useInstanceTarget("jackett", opts?.instanceId);
    const scopedId = opts?.indexerId;
    const searchOn = enabled && query.length >= 2 && !!id;

    // Same key/staleness as useJackettIndexers, so the Indexers tab's cached
    // list feeds the fan-out instead of a refetch per search.
    const indexers = useQuery({
      queryKey: ["jackett", id, "indexers"],
      queryFn: () => getIndexers(id ?? undefined),
      enabled: searchOn && !scopedId,
      staleTime: 300000,
    });

    const targets: Array<{ id: string; name: string }> = scopedId
      ? [{ id: scopedId, name: scopedId }]
      : (indexers.data ?? []).map((i) => ({ id: i.id, name: i.name }));

    const combined = useQueries({
      queries: targets.map((t) => ({
        // Same key shape for a scoped search and a fan-out slice, so the
        // per-indexer Search button (#315) and the all-search share cache.
        queryKey: ["jackett", id, "search", query, t.id],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          searchIndexer(query, t.id, id ?? undefined, signal),
        enabled: searchOn,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: false,
        select: (resp: JackettResultsResponse) =>
          resp.Results.map(jackettToUnified),
      })),
      combine: (results) =>
        combineIndexerSearches(
          results.map((r, i): IndexerSearchSlice => ({
            name: targets[i]?.name ?? "",
            pending: r.isPending,
            releases: r.data,
            error: r.isError
              ? // A per-indexer 90s abort surfaces as Hermes' bare "Aborted".
                isAbortError(r.error)
                ? "Timed out"
                : r.error instanceof Error
                  ? r.error.message
                  : String(r.error)
              : undefined,
          })),
        ),
    });

    if (!searchOn) return IDLE;
    if (!scopedId && indexers.isLoading) {
      return { data: undefined, isLoading: true, isError: false, error: null };
    }
    if (!scopedId && indexers.isError) {
      return { data: undefined, isLoading: false, isError: true, error: indexers.error };
    }
    return combined;
  },

  GrabFlow: JackettGrabFlow,
};

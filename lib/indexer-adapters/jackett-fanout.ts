import type { IndexerSearchState, UnifiedRelease } from "@/lib/indexer-adapter";

// Pure merge step of the Jackett per-indexer search fan-out (see
// lib/indexer-adapters/jackett.ts for why the fan-out exists — #314). Kept
// free of react-query so the pending/partial/error rules are unit-testable.

// One indexer's slice of an in-flight all-indexers search.
export interface IndexerSearchSlice {
  // Display name, used in the aggregated error message.
  name: string;
  // Still in flight — neither releases nor error yet.
  pending: boolean;
  releases?: UnifiedRelease[];
  error?: string;
}

export function combineIndexerSearches(
  slices: IndexerSearchSlice[],
): IndexerSearchState {
  // Jackett returns results in per-tracker arrival order and the UI slices the
  // top of the list, so sorting by seeders is load-bearing.
  const merged = slices
    .flatMap((s) => s.releases ?? [])
    .sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));

  // While slow trackers are still answering, show what the fast ones already
  // returned; with nothing yet, data stays undefined so the view renders
  // "Searching..." instead of a premature "No results".
  if (slices.some((s) => s.pending)) {
    return {
      data: merged.length > 0 ? merged : undefined,
      isLoading: true,
      isError: false,
      error: null,
    };
  }

  // A partial failure with something to show stays silent — an error banner
  // must not hide the working trackers' releases (#314).
  const failed = slices.filter((s) => s.error !== undefined);
  if (merged.length === 0 && failed.length > 0) {
    const first = failed[0];
    const message =
      slices.length === 1
        ? (first.error ?? "Search failed")
        : `${failed.length} of ${slices.length} indexers failed. ` +
          `${first.name}: ${first.error}`;
    return {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error(message),
    };
  }

  return { data: merged, isLoading: false, isError: false, error: null };
}

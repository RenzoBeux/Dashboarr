import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  buildHistoryRequest,
  getCaps,
  getDownloadHistory,
  getIndexerStatuses,
  getSearchHistory,
  getStats,
} from "@/services/nzbhydra2-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useServiceQuery } from "@/hooks/use-service-query";
import { statsWindow } from "@/lib/nzbhydra2-normalize";
import { POLLING_INTERVALS } from "@/lib/constants";
import type {
  Nzbhydra2DownloadHistoryRow,
  Nzbhydra2HistoryPage,
  Nzbhydra2HistoryRequest,
  Nzbhydra2SearchHistoryRow,
  Nzbhydra2StatsRequest,
} from "@/lib/types";

// Fits useServiceQuery exactly: no extra cache-key dimension, a small payload,
// and it moves on NZBHydra2's own hit-counter and backoff cadence.
export function useNzbhydra2IndexerStatuses(instanceId?: string) {
  return useServiceQuery(
    "nzbhydra2",
    ["indexerStatuses"],
    getIndexerStatuses,
    POLLING_INTERVALS.serviceHealth,
    instanceId,
  );
}

// Direct useQuery rather than useServiceQuery: caps needs a long staleTime and
// NO polling (it is static per server version), neither of which the wrapper
// can express. It is also the only NZBHydra2 endpoint outside the
// auth.allowApiStats gate, so its success is what lets the sub-tabs say "the
// stats API is switched off" instead of "your API key is wrong".
export function useNzbhydra2Caps(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("nzbhydra2", instanceId);
  return useQuery({
    queryKey: ["nzbhydra2", id, "caps"],
    queryFn: () => getCaps(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 3_600_000,
    retry: 1,
  });
}

// The ONLY flags we render. Every extra flag is real server-side work and
// upstream aborts the whole calculation at 30 seconds. Deliberately absent:
// avgIndexerUniquenessScore (an extra per-search join for a number we don't
// show) and the per-hour/per-day histograms (they would need a chart primitive
// this screen doesn't have).
const STATS_FLAGS: Nzbhydra2StatsRequest = {
  includeDisabled: true,
  indexerApiAccessStats: true,
  avgResponseTimes: true,
  indexerDownloadShares: true,
  successfulDownloadsPerIndexer: true,
};

// Direct useQuery: the window belongs in the cache key, which useServiceQuery
// can't express (the useCleanuparrStats precedent). No refetchInterval — this
// is the most expensive call in the app and a 35s timeout under a 30s poll
// would overlap. It refreshes on pull-to-refresh, on a window change, and when
// stale.
export function useNzbhydra2Stats(days: number, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("nzbhydra2", instanceId);
  return useQuery({
    queryKey: ["nzbhydra2", id, "stats", days],
    // statsWindow() is called inside the queryFn, not in the key: the key is
    // the window LENGTH, so a re-render can't mint a new cache entry every
    // millisecond.
    queryFn: () =>
      getStats({ ...STATS_FLAGS, ...statsWindow(days) }, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 300_000,
    // A call that already ran for 35s and failed will not succeed on an
    // immediate retry, and three of them would pin the server for two minutes.
    retry: 0,
  });
}

export interface Nzbhydra2HistorySort {
  column: string;
  descending: boolean;
}

// One generic body behind two typed exports: the searches and downloads rows
// are different shapes, and a single hook returning a union would push
// narrowing into every consumer. Both are always MOUNTED (rules of hooks) but
// only the selected table is `enabled`, so toggling back is instant off cache.
function useHydraHistory<T>(
  table: "searches" | "downloads",
  fetcher: (
    request: Nzbhydra2HistoryRequest,
    instanceId?: string,
  ) => Promise<Nzbhydra2HistoryPage<T>>,
  sort: Nzbhydra2HistorySort,
  active: boolean,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("nzbhydra2", instanceId);
  return useInfiniteQuery({
    queryKey: [
      "nzbhydra2",
      id,
      "history",
      table,
      sort.column,
      sort.descending,
    ],
    queryFn: ({ pageParam }) =>
      fetcher(
        buildHistoryRequest({
          // ONE-based, matching HistoryRequest.
          page: pageParam,
          column: sort.column,
          descending: sort.descending,
        }),
        id ?? undefined,
      ),
    initialPageParam: 1,
    // Page<T>.number is ZERO-based while the request page is ONE-based, so the
    // next request page is number + 2. `last` is authoritative.
    getNextPageParam: (lastPage) =>
      lastPage.last ? undefined : lastPage.number + 2,
    enabled: enabled && !!id && active,
    staleTime: 30_000,
  });
}

export function useNzbhydra2SearchHistory(
  sort: Nzbhydra2HistorySort,
  active: boolean,
  instanceId?: string,
) {
  return useHydraHistory<Nzbhydra2SearchHistoryRow>(
    "searches",
    getSearchHistory,
    sort,
    active,
    instanceId,
  );
}

export function useNzbhydra2DownloadHistory(
  sort: Nzbhydra2HistorySort,
  active: boolean,
  instanceId?: string,
) {
  return useHydraHistory<Nzbhydra2DownloadHistoryRow>(
    "downloads",
    getDownloadHistory,
    sort,
    active,
    instanceId,
  );
}

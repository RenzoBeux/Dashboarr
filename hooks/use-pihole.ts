import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  addCnameRecord,
  deleteCnameRecord,
  getBlocking,
  getCnameRecords,
  getHistory,
  getPadd,
  getQueries,
  getQuerySuggestions,
  getSummary,
  getTopClients,
  getTopDomains,
  getUpstreams,
  getVersion,
  runGravity,
  setBlocking,
} from "@/services/pihole-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useServiceQuery } from "@/hooks/use-service-query";
import { POLLING_INTERVALS } from "@/lib/constants";
import type { PiholeCnameRecord } from "@/lib/pihole-normalize";
import type { PiholeQueryFilters } from "@/lib/types";

/**
 * Cadences live here, not in POLLING_INTERVALS: they are Pi-hole-specific and
 * would mean nothing to another service (the NOTIFICATION_WATCHER_INTERVAL_MS
 * precedent in hooks/use-deluge.ts).
 */
const STATS_POLL_MS = 10_000; // FTL updates its counters per query
const TOP_N_POLL_MS = 30_000; // rankings barely move inside 30s
const HISTORY_POLL_MS = 60_000; // 10-minute buckets — faster cannot change it
const BLOCKING_TIMER_POLL_MS = 5_000;
const LIVE_LOG_POLL_MS = 3_000;
const QUERY_PAGE_SIZE = 100;

/**
 * Query-key builders.
 *
 * Exported so the dashboard widgets build byte-identical keys to the screen's
 * hooks. If the two ever drift, React Query treats them as separate entries and
 * every endpoint is fetched twice per instance.
 */
export const piholeKeys = {
  all: (id: string | null | undefined) => ["pihole", id] as const,
  blocking: (id: string | null | undefined) => ["pihole", id, "blocking"] as const,
  summary: (id: string | null | undefined) => ["pihole", id, "summary"] as const,
  padd: (id: string | null | undefined) => ["pihole", id, "padd"] as const,
  history: (id: string | null | undefined) => ["pihole", id, "history"] as const,
  upstreams: (id: string | null | undefined) => ["pihole", id, "upstreams"] as const,
  version: (id: string | null | undefined) => ["pihole", id, "version"] as const,
  cnameRecords: (id: string | null | undefined) =>
    ["pihole", id, "cnameRecords"] as const,
  querySuggestions: (id: string | null | undefined) =>
    ["pihole", id, "querySuggestions"] as const,
  topDomains: (id: string | null | undefined, blocked: boolean, count: number) =>
    ["pihole", id, "topDomains", blocked, count] as const,
  topClients: (id: string | null | undefined, blocked: boolean, count: number) =>
    ["pihole", id, "topClients", blocked, count] as const,
  recentBlocked: (id: string | null | undefined, count: number) =>
    ["pihole", id, "recentBlocked", count] as const,
  liveQueries: (id: string | null | undefined, filterKey: string) =>
    ["pihole", id, "queries", "live", filterKey] as const,
  queryLog: (id: string | null | undefined, filterKey: string) =>
    ["pihole", id, "queries", "page", filterKey] as const,
};

/**
 * Stable serialization of a filter object for the cache key.
 *
 * A literal object in the key would be a new reference every render, minting a
 * fresh cache entry each time and re-fetching forever.
 */
export function piholeFilterKey(filters: PiholeQueryFilters): string {
  const entries = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(entries) : "all";
}

// --- Blocking ---------------------------------------------------------------

/**
 * Blocking state and the remaining seconds on any timer.
 *
 * `timer` is remaining seconds AT THE MOMENT FTL ANSWERED, not an absolute
 * deadline. Consumers must anchor it to this query's `dataUpdatedAt` —
 *
 *   remaining = max(0, (data.timer ?? 0) - (Date.now() - dataUpdatedAt) / 1000)
 *
 * — and tick that locally. Do NOT poll once a second to keep a countdown
 * honest: that is 3600 authenticated requests an hour against a server that
 * allows 16 concurrent sessions. The poll only has to be tight enough to catch
 * the server's automatic flip back, so it runs at 5s while a timer is live and
 * backs off to the health cadence when nothing is counting down.
 */
export function usePiholeBlocking(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.blocking(id),
    queryFn: () => getBlocking(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.timer != null
        ? BLOCKING_TIMER_POLL_MS
        : POLLING_INTERVALS.serviceHealth,
  });
}

export function useSetPiholeBlocking(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("pihole", instanceId);
  return useMutation({
    mutationFn: (vars: { blocking: boolean; timer: number | null }) =>
      setBlocking(vars.blocking, vars.timer, id ?? undefined),
    onSuccess: async (data) => {
      // Seed the cache from the POST's own echo rather than refetching. This
      // also stops an older in-flight poll from landing afterwards and visibly
      // flipping the switch back.
      await queryClient.cancelQueries({ queryKey: piholeKeys.blocking(id) });
      queryClient.setQueryData(piholeKeys.blocking(id), data);
      invalidatePiholeStats(queryClient, id);
    },
  });
}

// --- Gravity ----------------------------------------------------------------

/**
 * Run gravity.
 *
 * `retry: 0` is load-bearing. The global query client retries twice
 * (lib/query-client.ts), and this call runs for minutes — a retry would start a
 * SECOND concurrent gravity run on the server.
 *
 * The call also cannot be cancelled: aborting stops us reading, not the run. So
 * callers must treat a timeout as "still running" and let the summary
 * invalidation below confirm completion via gravity.last_update.
 */
export function useRunPiholeGravity(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("pihole", instanceId);
  return useMutation({
    mutationFn: () => runGravity(id ?? undefined),
    retry: 0,
    onSuccess: () => invalidatePiholeStats(queryClient, id),
  });
}

// --- Stats ------------------------------------------------------------------

export function usePiholeSummary(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.summary(id),
    queryFn: () => getSummary(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: STATS_POLL_MS,
    refetchInterval: STATS_POLL_MS,
  });
}

export function usePiholePadd(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.padd(id),
    queryFn: () => getPadd(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: STATS_POLL_MS,
    refetchInterval: STATS_POLL_MS,
  });
}

export function usePiholeTopDomains(
  blocked: boolean,
  count = 10,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.topDomains(id, blocked, count),
    queryFn: () => getTopDomains({ blocked, count }, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: TOP_N_POLL_MS,
    refetchInterval: TOP_N_POLL_MS,
  });
}

export function usePiholeTopClients(count = 10, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.topClients(id, false, count),
    queryFn: () => getTopClients({ count }, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: TOP_N_POLL_MS,
    refetchInterval: TOP_N_POLL_MS,
  });
}

export function usePiholeHistory(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.history(id),
    queryFn: () => getHistory(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: HISTORY_POLL_MS,
    refetchInterval: HISTORY_POLL_MS,
  });
}

// These three fit the shared wrapper: one cache dimension, one fixed interval.
export function usePiholeUpstreams(instanceId?: string) {
  return useServiceQuery("pihole", ["upstreams"], getUpstreams, TOP_N_POLL_MS, instanceId);
}

export function usePiholeVersion(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.version(id),
    queryFn: () => getVersion(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 3_600_000,
  });
}

// --- Query log --------------------------------------------------------------

/**
 * The live head of the query log: a plain newest-N query, deliberately NOT the
 * infinite one below.
 *
 * TanStack v5 has no per-page refetch — refetching an infinite query refetches
 * EVERY loaded page with its original cursor, so page 1 returns newer rows
 * while later pages return their original absolute windows, duplicating rows at
 * the seam. Polling therefore lives on its own single-page query, and the
 * screen swaps between the two.
 */
export function usePiholeLiveQueries(
  filters: PiholeQueryFilters,
  live: boolean,
  instanceId?: string,
  // The Pi-hole tab's 5-row preview card is mounted the whole time that tab is
  // open, so it opts into a much slower cadence than the log screen's 3s.
  intervalMs: number = LIVE_LOG_POLL_MS,
) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.liveQueries(id, piholeFilterKey(filters)),
    queryFn: () => getQueries({ ...filters, length: QUERY_PAGE_SIZE }, id ?? undefined),
    enabled: enabled && !!id && live,
    staleTime: 0,
    refetchInterval: live ? intervalMs : false,
  });
}

/** Cadence for the tab's always-mounted recent-queries preview. */
export const PIHOLE_PREVIEW_POLL_MS = 30_000;

/** Scrollback. No refetchInterval, for the reason above. */
export function usePiholeQueryLog(
  filters: PiholeQueryFilters,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useInfiniteQuery({
    queryKey: piholeKeys.queryLog(id, piholeFilterKey(filters)),
    queryFn: ({ pageParam }) =>
      getQueries(
        { ...filters, length: QUERY_PAGE_SIZE, cursor: pageParam },
        id ?? undefined,
      ),
    initialPageParam: undefined as number | undefined,
    // Three independent stop conditions. The third matters most: a cursor equal
    // to the previous page's would otherwise re-fetch the same rows forever.
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.queries.length < QUERY_PAGE_SIZE) return undefined;
      if (lastPage.cursor == null) return undefined;
      if (lastPage.cursor === allPages.at(-2)?.cursor) return undefined;
      return lastPage.cursor;
    },
    enabled: enabled && !!id,
    staleTime: 10_000,
  });
}

export function usePiholeQuerySuggestions(instanceId?: string, active = true) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.querySuggestions(id),
    queryFn: () => getQuerySuggestions(id ?? undefined),
    enabled: enabled && !!id && active,
    staleTime: 300_000,
  });
}

// --- Local CNAME records ----------------------------------------------------

export function usePiholeCnameRecords(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("pihole", instanceId);
  return useQuery({
    queryKey: piholeKeys.cnameRecords(id),
    queryFn: () => getCnameRecords(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 60_000,
  });
}

export function useAddPiholeCname(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("pihole", instanceId);
  return useMutation({
    mutationFn: (input: { cname: string; target: string; ttl?: number | null }) =>
      addCnameRecord(input, id ?? undefined),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: piholeKeys.cnameRecords(id) }),
  });
}

export function useDeletePiholeCname(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("pihole", instanceId);
  return useMutation({
    mutationFn: (record: PiholeCnameRecord) =>
      deleteCnameRecord(record, id ?? undefined),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: piholeKeys.cnameRecords(id) }),
  });
}

// --- Invalidation -----------------------------------------------------------

/**
 * Refresh the counters a blocking toggle or a gravity run actually changes.
 *
 * Deliberately NOT the whole ["pihole", id] slice: that would drop every page
 * the query log has loaded and re-fetch the 24h history chart on every flick of
 * the blocking switch. Same reasoning as invalidateDelugeTorrents.
 */
export function invalidatePiholeStats(
  queryClient: QueryClient,
  id: string | null | undefined,
): void {
  queryClient.invalidateQueries({ queryKey: piholeKeys.summary(id) });
  queryClient.invalidateQueries({ queryKey: piholeKeys.padd(id) });
}

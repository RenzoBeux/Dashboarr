import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  addRewrite,
  deleteRewrite,
  getBlockedServices,
  getBlockedServicesAll,
  getFilterStatus,
  getQueryLog,
  getRewrites,
  getStats,
  getStatus,
  refreshFilters,
  setBlockedServices,
  setProtection,
} from "@/services/adguard-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { toggleBlockedService } from "@/lib/adguard-blocked-services";
import type {
  AdguardBlockedServicesSchedule,
  AdguardQueryLogFilters,
  AdguardRewriteEntry,
  AdguardServerStatus,
} from "@/lib/types";

/**
 * Cadences live here, not in POLLING_INTERVALS: they are AdGuard Home-specific
 * and would mean nothing to another service (the STATS_POLL_MS precedent in
 * hooks/use-pihole.ts).
 */
const STATUS_POLL_MS = 10_000; // matches the status ring's countdown granularity
const STATS_POLL_MS = 30_000;
const PROTECTION_TIMER_POLL_MS = 5_000;
const LIVE_LOG_POLL_MS = 3_000;
const QUERY_PAGE_SIZE = 100;

/**
 * Query-key builders.
 *
 * Exported so the dashboard widgets build byte-identical keys to the screen's
 * hooks. If the two ever drift, React Query treats them as separate entries
 * and every endpoint is fetched twice per instance.
 */
export const adguardKeys = {
  all: (id: string | null | undefined) => ["adguard", id] as const,
  status: (id: string | null | undefined) => ["adguard", id, "status"] as const,
  stats: (id: string | null | undefined) => ["adguard", id, "stats"] as const,
  filterStatus: (id: string | null | undefined) =>
    ["adguard", id, "filterStatus"] as const,
  rewrites: (id: string | null | undefined) => ["adguard", id, "rewrites"] as const,
  blockedServicesAll: (id: string | null | undefined) =>
    ["adguard", id, "blockedServices", "all"] as const,
  blockedServices: (id: string | null | undefined) =>
    ["adguard", id, "blockedServices", "current"] as const,
  liveQueryLog: (id: string | null | undefined, filterKey: string) =>
    ["adguard", id, "querylog", "live", filterKey] as const,
  queryLogPage: (id: string | null | undefined, filterKey: string) =>
    ["adguard", id, "querylog", "page", filterKey] as const,
};

/**
 * Stable serialization of a filter object for the cache key.
 *
 * A literal object in the key would be a new reference every render, minting
 * a fresh cache entry each time and re-fetching forever.
 */
export function adguardFilterKey(filters: AdguardQueryLogFilters): string {
  const entries = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(entries) : "all";
}

// --- Status & protection ----------------------------------------------------

/**
 * Server status, including the protection toggle and any active timer.
 *
 * `protection_disabled_duration` is REMAINING milliseconds AT THE MOMENT AGH
 * answered, not an absolute deadline. Consumers must anchor it to this
 * query's `dataUpdatedAt` —
 *
 *   remainingMs = max(0, data.protection_disabled_duration - (Date.now() - dataUpdatedAt))
 *
 * — and tick that locally rather than polling once a second.
 */
export function useAdguardStatus(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useQuery({
    queryKey: adguardKeys.status(id),
    queryFn: () => getStatus(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.protection_enabled === false &&
      (query.state.data.protection_disabled_duration ?? 0) > 0
        ? PROTECTION_TIMER_POLL_MS
        : STATUS_POLL_MS,
  });
}

export function useSetAdguardProtection(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  return useMutation({
    mutationFn: (vars: { enabled: boolean; duration?: number }) =>
      setProtection(vars.enabled, vars.duration ?? 0, id ?? undefined),
    onSuccess: async (confirmed) => {
      // /control/protection answers with no body, so seed the cache from the
      // request we just confirmed the server accepted rather than from a
      // response that doesn't exist. This also stops an older in-flight poll
      // from landing afterwards and visibly flipping the switch back.
      await queryClient.cancelQueries({ queryKey: adguardKeys.status(id) });
      queryClient.setQueryData(
        adguardKeys.status(id),
        (prev: AdguardServerStatus | undefined) =>
          prev && {
            ...prev,
            protection_enabled: confirmed.enabled,
            protection_disabled_duration: confirmed.duration,
          },
      );
      invalidateAdguardStats(queryClient, id);
    },
  });
}

// --- Stats -------------------------------------------------------------------

export function useAdguardStats(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useQuery({
    queryKey: adguardKeys.stats(id),
    queryFn: () => getStats(undefined, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: STATS_POLL_MS,
    refetchInterval: STATS_POLL_MS,
  });
}

// --- Query log ---------------------------------------------------------------

/**
 * The live head of the query log: a plain newest-N query, deliberately NOT the
 * infinite one below.
 *
 * TanStack v5 has no per-page refetch — refetching an infinite query refetches
 * EVERY loaded page with its original cursor, so page 1 returns newer rows
 * while later pages return their original absolute windows, duplicating rows
 * at the seam (the hooks/use-pihole.ts precedent). Polling therefore lives on
 * its own single-page query, and the screen swaps between the two.
 */
export function useAdguardLiveQueryLog(
  filters: AdguardQueryLogFilters,
  live: boolean,
  instanceId?: string,
  intervalMs: number = LIVE_LOG_POLL_MS,
) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useQuery({
    queryKey: adguardKeys.liveQueryLog(id, adguardFilterKey(filters)),
    queryFn: () =>
      getQueryLog({ ...filters, limit: filters.limit ?? QUERY_PAGE_SIZE }, id ?? undefined),
    enabled: enabled && !!id && live,
    staleTime: 0,
    refetchInterval: live ? intervalMs : false,
  });
}

/** Cadence for the tab's always-mounted recent-queries preview. */
export const ADGUARD_PREVIEW_POLL_MS = 30_000;

/** Scrollback. No refetchInterval, for the reason above. */
export function useAdguardQueryLog(filters: AdguardQueryLogFilters, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useInfiniteQuery({
    queryKey: adguardKeys.queryLogPage(id, adguardFilterKey(filters)),
    queryFn: ({ pageParam }) =>
      getQueryLog(
        { ...filters, limit: QUERY_PAGE_SIZE, olderThan: pageParam },
        id ?? undefined,
      ),
    initialPageParam: undefined as string | undefined,
    // Three independent stop conditions. The third matters most: a cursor
    // equal to the previous page's would otherwise re-fetch the same rows
    // forever.
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.data.length < QUERY_PAGE_SIZE) return undefined;
      if (!lastPage.oldest) return undefined;
      if (lastPage.oldest === allPages.at(-2)?.oldest) return undefined;
      return lastPage.oldest;
    },
    enabled: enabled && !!id,
    staleTime: 10_000,
  });
}

// --- Filtering -----------------------------------------------------------

export function useAdguardFilterStatus(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useQuery({
    queryKey: adguardKeys.filterStatus(id),
    queryFn: () => getFilterStatus(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 60_000,
  });
}

export function useRefreshAdguardFilters(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  return useMutation({
    mutationFn: (whitelist: boolean) => refreshFilters(whitelist, id ?? undefined),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adguardKeys.filterStatus(id) }),
  });
}

// --- Blocked services ------------------------------------------------------

const BLOCKED_SERVICES_POLL_MS = 30_000;

/** The catalog: fixed for an AGH build, so one fetch per session. */
export function useAdguardBlockedServicesAll(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useQuery({
    queryKey: adguardKeys.blockedServicesAll(id),
    queryFn: () => getBlockedServicesAll(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
    gcTime: 24 * 3_600_000,
  });
}

export function useAdguardBlockedServices(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useQuery({
    queryKey: adguardKeys.blockedServices(id),
    queryFn: () => getBlockedServices(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: BLOCKED_SERVICES_POLL_MS,
    refetchInterval: BLOCKED_SERVICES_POLL_MS,
  });
}

/**
 * Flip one service. Optimistic (the switch moves at once) with rollback,
 * but the write itself re-reads `/blocked_services/get` first: the PUT
 * replaces ids AND schedule, so sending the cached schedule — or a stale
 * ids list from before a toggle made in the web UI — would silently undo
 * it. Two quick taps serialize through TanStack's mutation queue only if
 * the caller awaits; the screen disables the switch while pending instead.
 */
export function useToggleAdguardBlockedService(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  const key = adguardKeys.blockedServices(id);
  return useMutation({
    mutationFn: async (vars: { serviceId: string; blocked: boolean }) => {
      const current = await getBlockedServices(id ?? undefined);
      const body: AdguardBlockedServicesSchedule = {
        ids: toggleBlockedService(current.ids, vars.serviceId, vars.blocked),
        schedule: current.schedule,
      };
      await setBlockedServices(body, id ?? undefined);
      return body;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AdguardBlockedServicesSchedule>(key);
      queryClient.setQueryData<AdguardBlockedServicesSchedule>(key, (prev) =>
        prev
          ? { ...prev, ids: toggleBlockedService(prev.ids, vars.serviceId, vars.blocked) }
          : prev,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (body) => {
      queryClient.setQueryData<AdguardBlockedServicesSchedule>(key, body);
      invalidateAdguardStats(queryClient, id);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

// --- DNS rewrites (custom records) -------------------------------------------

export function useAdguardRewrites(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("adguard", instanceId);
  return useQuery({
    queryKey: adguardKeys.rewrites(id),
    queryFn: () => getRewrites(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 60_000,
  });
}

export function useAddAdguardRewrite(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  return useMutation({
    mutationFn: (entry: AdguardRewriteEntry) => addRewrite(entry, id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adguardKeys.rewrites(id) }),
  });
}

export function useDeleteAdguardRewrite(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  return useMutation({
    mutationFn: (entry: AdguardRewriteEntry) => deleteRewrite(entry, id ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adguardKeys.rewrites(id) }),
  });
}

// --- Invalidation --------------------------------------------------------

/**
 * Refresh the counters a protection toggle actually changes. Deliberately NOT
 * the whole ["adguard", id] slice: that would drop every page the query log
 * has loaded and re-fetch the filter list on every flick of the protection
 * switch — same reasoning as invalidatePiholeStats.
 */
export function invalidateAdguardStats(
  queryClient: QueryClient,
  id: string | null | undefined,
): void {
  queryClient.invalidateQueries({ queryKey: adguardKeys.stats(id) });
}

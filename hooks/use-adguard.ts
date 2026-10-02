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
  getFilterStatus,
  getQueryLog,
  getRewrites,
  getStats,
  getStatus,
  refreshFilters,
  setProtection,
  setUserRules,
} from "@/services/adguard-api";
import { useEnabledInstances, useInstanceTarget } from "@/hooks/use-instance-target";
import {
  addRuleLine,
  applyDomainRule,
  removeRuleLine,
  userRulesOf,
  type AdguardDomainRuleChange,
  type DomainRuleEdit,
} from "@/lib/adguard-rules";
import type {
  AdguardFilterStatus,
  AdguardQueryLogFilters,
  AdguardRewriteEntry,
  AdguardServerStatus,
} from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

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

// --- Custom (user) rules -------------------------------------------------

/**
 * Every rule write is a read-modify-write on a FRESH `/filtering/status`:
 * set_rules replaces the whole list, and the cached copy can be up to 60 s
 * old (useAdguardFilterStatus's staleTime), so editing it would silently
 * drop a rule added from the web UI or another phone in between. On success
 * the cache is seeded from the list we sent — the same "no response body"
 * pattern as useSetAdguardProtection — and the counters are refreshed, since
 * a new allow rule changes what gets blocked from the next query on.
 */
async function writeRules(
  id: string | undefined,
  edit: (current: string[]) => { rules: string[]; changed: boolean },
): Promise<string[]> {
  const status = await getFilterStatus(id);
  const result = edit(userRulesOf(status));
  if (result.changed) await setUserRules(result.rules, id);
  return result.rules;
}

function seedUserRules(
  queryClient: QueryClient,
  id: string | null | undefined,
  rules: string[],
): void {
  queryClient.setQueryData(
    adguardKeys.filterStatus(id),
    (prev: AdguardFilterStatus | undefined) => prev && { ...prev, user_rules: rules },
  );
  invalidateAdguardStats(queryClient, id);
}

export interface AdguardDomainRuleVars {
  domain: string;
  change: AdguardDomainRuleChange;
}

/** Allow, block or clear one domain on the targeted instance. */
export function useAdguardDomainRule(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  return useMutation({
    mutationFn: async (vars: AdguardDomainRuleVars): Promise<DomainRuleEdit> => {
      let edit: DomainRuleEdit | undefined;
      await writeRules(id ?? undefined, (current) => {
        edit = applyDomainRule(current, vars.domain, vars.change);
        return edit;
      });
      return edit!;
    },
    onSuccess: (edit) => seedUserRules(queryClient, id, edit.rules),
  });
}

export interface AdguardDomainRuleEverywhereResult {
  ok: { instance: ServiceInstance; edit: DomainRuleEdit }[];
  failed: { instance: ServiceInstance; error: unknown }[];
}

/**
 * The same change fanned out to EVERY enabled AdGuard Home instance — for a
 * home running a second instance (a DHCP box, a fallback resolver) that must
 * agree with the first, or a domain is only unblocked on whichever resolver
 * the client happened to ask. Instances are written independently; one
 * failing (offline, wrong password) never rolls back the others, and the
 * result names each so the caller can say which ones did not take.
 */
export function useAdguardDomainRuleEverywhere() {
  const queryClient = useQueryClient();
  const instances = useEnabledInstances("adguard");
  return useMutation({
    mutationFn: async (vars: AdguardDomainRuleVars): Promise<AdguardDomainRuleEverywhereResult> => {
      const settled = await Promise.allSettled(
        instances.map(async (instance) => {
          let edit: DomainRuleEdit | undefined;
          await writeRules(instance.id, (current) => {
            edit = applyDomainRule(current, vars.domain, vars.change);
            return edit;
          });
          return { instance, edit: edit! };
        }),
      );
      const result: AdguardDomainRuleEverywhereResult = { ok: [], failed: [] };
      settled.forEach((outcome, i) => {
        if (outcome.status === "fulfilled") result.ok.push(outcome.value);
        else result.failed.push({ instance: instances[i]!, error: outcome.reason });
      });
      return result;
    },
    onSuccess: (result) => {
      for (const { instance, edit } of result.ok) {
        seedUserRules(queryClient, instance.id, edit.rules);
      }
    },
  });
}

/** Append one raw rule line (the rules screen's advanced mode). */
export function useAddAdguardRule(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  return useMutation({
    mutationFn: (line: string) => writeRules(id ?? undefined, (current) => addRuleLine(current, line)),
    onSuccess: (rules) => seedUserRules(queryClient, id, rules),
  });
}

/** Remove one rule line verbatim (the rules screen's trash button). */
export function useRemoveAdguardRule(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("adguard", instanceId);
  return useMutation({
    mutationFn: (line: string) =>
      writeRules(id ?? undefined, (current) => removeRuleLine(current, line)),
    onSuccess: (rules) => seedUserRules(queryClient, id, rules),
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

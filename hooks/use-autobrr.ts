import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  findReleases,
  getFilters,
  getIrcNetworks,
  getReleaseStats,
  retryReleasePush,
  restartIrcNetwork,
  setFilterEnabled,
} from "@/services/autobrr-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useServiceMutation, useServiceQuery } from "@/hooks/use-service-query";
import type { AutobrrPushStatus } from "@/lib/types";

export function useAutobrrStats(instanceId?: string) {
  return useServiceQuery("autobrr", ["stats"], getReleaseStats, 30000, instanceId);
}

// Direct useQuery rather than useServiceQuery: the search/filter params belong
// in the cache key, which the wrapper can't express.
export function useAutobrrReleases(
  opts: { q?: string; pushStatus?: AutobrrPushStatus },
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("autobrr", instanceId);
  return useQuery({
    queryKey: ["autobrr", id, "releases", opts.pushStatus ?? "all", opts.q ?? ""],
    queryFn: () => findReleases(opts, id ?? undefined),
    enabled: enabled && !!id,
    staleTime: 15000,
    refetchInterval: 30000,
    // The key changes on every chip/search change — without this the list
    // blanks to a skeleton on each keystroke (same fix as the *arr search).
    placeholderData: keepPreviousData,
  });
}

export function useAutobrrFilters(instanceId?: string) {
  // The filter set changes only when the user edits autobrr itself — same
  // 5-minute staleness the Prowlarr/Jackett indexer lists use.
  return useServiceQuery("autobrr", ["filters"], getFilters, 300000, instanceId);
}

export function useAutobrrIrc(instanceId?: string) {
  return useServiceQuery("autobrr", ["irc"], getIrcNetworks, 30000, instanceId);
}

export function useToggleAutobrrFilter(instanceId?: string) {
  return useServiceMutation(
    "autobrr",
    (args: { filterId: number; enabled: boolean }, id) =>
      setFilterEnabled(args.filterId, args.enabled, id),
    instanceId,
  );
}

export function useRetryAutobrrPush(instanceId?: string) {
  return useServiceMutation(
    "autobrr",
    (args: { releaseId: number; actionStatusId: number }, id) =>
      retryReleasePush(args.releaseId, args.actionStatusId, id),
    instanceId,
  );
}

export function useRestartAutobrrIrc(instanceId?: string) {
  return useServiceMutation(
    "autobrr",
    (networkId: number, id) => restartIrcNetwork(networkId, id),
    instanceId,
  );
}

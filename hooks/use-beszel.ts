import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getContainerStats, getContainers, getSystemStats, getSystems } from "@/services/beszel-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import {
  normalizeBeszelContainerStatsPoint,
  normalizeBeszelStatsPoint,
  normalizeBeszelSystem,
} from "@/lib/beszel-normalize";
import { BESZEL_RANGES, beszelSinceFilter, type BeszelRange } from "@/lib/beszel-ranges";

const SYSTEMS_POLL = 10_000;
const CONTAINERS_POLL = 15_000;

/** The systems list — cheap, single call, already carries each system's live snapshot. */
export function useBeszelSystems(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("beszel", instanceId);
  return useQuery({
    queryKey: ["beszel", id, "systems"],
    queryFn: async () => (await getSystems(id ?? undefined)).map(normalizeBeszelSystem),
    refetchInterval: SYSTEMS_POLL,
    enabled: enabled && !!id,
  });
}

/**
 * One system's rollups over `range`, chronological. `since` is computed inside
 * queryFn so each poll slides the window forward; keepPreviousData keeps the
 * old range's charts on screen while a newly picked range loads.
 */
export function useBeszelSystemStats(systemId: string | undefined, range: BeszelRange | null, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("beszel", instanceId);
  // null = Live range: the stream replaces these, so don't fetch.
  const { rollup, pollMs } = BESZEL_RANGES[range ?? "1h"];
  return useQuery({
    queryKey: ["beszel", id, "system_stats", systemId, range],
    queryFn: async () =>
      (await getSystemStats(systemId as string, rollup, beszelSinceFilter(range ?? "1h", Date.now()), id ?? undefined))
        .map(normalizeBeszelStatsPoint)
        .reverse(), // API returns newest-first; charts read chronologically
    refetchInterval: pollMs,
    placeholderData: keepPreviousData,
    enabled: enabled && !!id && !!systemId && range !== null,
  });
}

/** Per-container rollups over `range`, chronological — feeds the Docker charts. */
export function useBeszelContainerStats(systemId: string | undefined, range: BeszelRange | null, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("beszel", instanceId);
  // null = Live range: the stream replaces these, so don't fetch.
  const { rollup, pollMs } = BESZEL_RANGES[range ?? "1h"];
  return useQuery({
    queryKey: ["beszel", id, "container_stats", systemId, range],
    queryFn: async () =>
      (await getContainerStats(systemId as string, rollup, beszelSinceFilter(range ?? "1h", Date.now()), id ?? undefined))
        .map(normalizeBeszelContainerStatsPoint)
        .reverse(),
    refetchInterval: pollMs,
    placeholderData: keepPreviousData,
    enabled: enabled && !!id && !!systemId && range !== null,
  });
}

/** Docker containers for one system, on the detail screen. */
export function useBeszelContainers(systemId: string | undefined, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("beszel", instanceId);
  return useQuery({
    queryKey: ["beszel", id, "containers", systemId],
    queryFn: () => getContainers(systemId as string, id ?? undefined),
    refetchInterval: CONTAINERS_POLL,
    enabled: enabled && !!id && !!systemId,
  });
}

import { useQuery } from "@tanstack/react-query";
import { getSystems, getSystemStats, getContainers } from "@/services/beszel-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { normalizeBeszelSystem, normalizeBeszelStatsPoint } from "@/lib/beszel-normalize";

const SYSTEMS_POLL = 10_000;
const STATS_POLL = 60_000;
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

/** Historical rollup for one system's detail-screen chart. */
export function useBeszelSystemStats(
  systemId: string | undefined,
  type: "1m" | "10m" | "20m" | "120m" | "480m",
  limit: number,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget("beszel", instanceId);
  return useQuery({
    queryKey: ["beszel", id, "system_stats", systemId, type, limit],
    queryFn: async () =>
      (await getSystemStats(systemId as string, type, limit, id ?? undefined))
        .map(normalizeBeszelStatsPoint)
        .reverse(), // API returns newest-first; charts read chronologically
    refetchInterval: STATS_POLL,
    enabled: enabled && !!id && !!systemId,
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

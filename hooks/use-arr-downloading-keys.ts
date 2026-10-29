import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { radarrQueueQuery, sonarrQueueQuery } from "@/lib/arr-queue-query";
import { queueActivityMap, type QueueActivity } from "@/lib/arr-poster-status";
import type { ServiceInstance } from "@/store/config-store";

/** Stable empty list, so a caller hiding a kind doesn't churn the memo. */
export const NO_INSTANCES: ServiceInstance[] = [];

/**
 * `instanceId:episodeId` / `instanceId:movieId` for everything currently in a
 * Sonarr/Radarr download queue — the set every calendar-shaped surface reads to
 * paint a grabbing item purple (#207). Ids aren't unique across instances,
 * hence the composite key.
 *
 * `queued` is every key; `held` is the subset whose records are all still held
 * by the *arr itself (delay profile / client unavailable, #484), which those
 * surfaces draw dashed. Callers feed `queued` alone to
 * useRefreshOnDownloadComplete, so a hold turning into a real download never
 * reads as a departure.
 *
 * Fans out across the instances it's given, so a caller hiding a kind passes
 * `NO_INSTANCES` for it. Shares the `["sonarr"/"radarr", id, "queue"]` cache
 * with the rest of the app via lib/arr-queue-query.
 */
export function useArrDownloadingKeys(
  sonarrInstances: ServiceInstance[],
  radarrInstances: ServiceInstance[],
): { queued: Set<string>; held: Set<string> } {
  const sonarrQueues = useQueries({
    queries: sonarrInstances.map((inst) => sonarrQueueQuery(inst.id)),
  });
  const radarrQueues = useQueries({
    queries: radarrInstances.map((inst) => radarrQueueQuery(inst.id)),
  });

  return useMemo(() => {
    const queued = new Set<string>();
    const held = new Set<string>();
    const collect = (activity: Map<string, QueueActivity>) => {
      for (const [key, state] of activity) {
        queued.add(key);
        if (state === "held") held.add(key);
      }
    };
    sonarrQueues.forEach((q, i) => {
      const instanceId = sonarrInstances[i]?.id;
      if (!instanceId) return;
      collect(
        queueActivityMap(q.data?.records, (r) => `${instanceId}:${r.episodeId}`),
      );
    });
    radarrQueues.forEach((q, i) => {
      const instanceId = radarrInstances[i]?.id;
      if (!instanceId) return;
      collect(
        queueActivityMap(q.data?.records, (r) => `${instanceId}:${r.movieId}`),
      );
    });
    return { queued, held };
  }, [sonarrQueues, radarrQueues, sonarrInstances, radarrInstances]);
}

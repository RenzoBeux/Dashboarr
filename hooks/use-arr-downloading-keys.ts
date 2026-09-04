import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { radarrQueueQuery, sonarrQueueQuery } from "@/lib/arr-queue-query";
import type { ServiceInstance } from "@/store/config-store";

/** Stable empty list, so a caller hiding a kind doesn't churn the memo. */
export const NO_INSTANCES: ServiceInstance[] = [];

/**
 * `instanceId:episodeId` / `instanceId:movieId` for everything currently in a
 * Sonarr/Radarr download queue — the set every calendar-shaped surface reads to
 * paint a grabbing item purple (#207). Ids aren't unique across instances,
 * hence the composite key.
 *
 * Fans out across the instances it's given, so a caller hiding a kind passes
 * `NO_INSTANCES` for it. Shares the `["sonarr"/"radarr", id, "queue"]` cache
 * with the rest of the app via lib/arr-queue-query.
 */
export function useArrDownloadingKeys(
  sonarrInstances: ServiceInstance[],
  radarrInstances: ServiceInstance[],
): Set<string> {
  const sonarrQueues = useQueries({
    queries: sonarrInstances.map((inst) => sonarrQueueQuery(inst.id)),
  });
  const radarrQueues = useQueries({
    queries: radarrInstances.map((inst) => radarrQueueQuery(inst.id)),
  });

  return useMemo(() => {
    const keys = new Set<string>();
    sonarrQueues.forEach((q, i) => {
      const instanceId = sonarrInstances[i]?.id;
      if (!instanceId) return;
      for (const r of q.data?.records ?? [])
        keys.add(`${instanceId}:${r.episodeId}`);
    });
    radarrQueues.forEach((q, i) => {
      const instanceId = radarrInstances[i]?.id;
      if (!instanceId) return;
      for (const r of q.data?.records ?? [])
        keys.add(`${instanceId}:${r.movieId}`);
    });
    return keys;
  }, [sonarrQueues, radarrQueues, sonarrInstances, radarrInstances]);
}

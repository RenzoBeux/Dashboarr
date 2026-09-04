import { POLLING_INTERVALS } from "@/lib/constants";
import { getQueue as getRadarrQueue } from "@/services/radarr-api";
import { getQueue as getSonarrQueue } from "@/services/sonarr-api";

/**
 * The single source of truth for the shared `["sonarr"/"radarr", id, "queue"]`
 * cache entry.
 *
 * TanStack stores one `queryFn` per cache key, and every observer writes its own
 * options onto the query as it renders — so whichever one fetched last decides
 * the request arguments for all of them. The Calendar tab and the two dashboard
 * cards used to declare that key with `pageSize: 20` while the hooks and the
 * queue adapters used 100, which left the effective page size depending on
 * nothing more than which screens happened to be mounted (#401). Every producer
 * of this key goes through here instead.
 *
 * 100 is generous on purpose: `/queue` sorts by `timeleft` descending by
 * default (see the note in services/sonarr-api.ts), which pushes stalled and
 * pending items to the front and can bury an in-flight download several pages
 * deep on a busy instance.
 */
export const ARR_QUEUE_PAGE_SIZE = 100;

export function fetchSonarrQueue(instanceId?: string) {
  return getSonarrQueue(1, ARR_QUEUE_PAGE_SIZE, true, true, instanceId);
}

export function fetchRadarrQueue(instanceId?: string) {
  return getRadarrQueue(1, ARR_QUEUE_PAGE_SIZE, true, instanceId);
}

export function sonarrQueueQuery(instanceId?: string) {
  return {
    queryKey: ["sonarr", instanceId, "queue"] as const,
    queryFn: () => fetchSonarrQueue(instanceId),
    refetchInterval: POLLING_INTERVALS.queue,
  };
}

export function radarrQueueQuery(instanceId?: string) {
  return {
    queryKey: ["radarr", instanceId, "queue"] as const,
    queryFn: () => fetchRadarrQueue(instanceId),
    refetchInterval: POLLING_INTERVALS.queue,
  };
}

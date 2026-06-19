import { getQueue, getWantedMissing, getRadarrPoster } from "@/services/radarr-api";
import type { RadarrQueue, RadarrWantedMissing } from "@/lib/types";
import type { ArrQueueAdapter } from "@/lib/arr-queue-adapter";

export const radarrArrQueueAdapter: ArrQueueAdapter = {
  serviceId: "radarr",
  displayName: "Radarr",
  listRoute: "/(tabs)/movies",
  emptyQueueLabel: "No movies in queue",
  badgeColor: "rgba(37, 99, 235, 0.9)",
  mediaType: "movie",

  queueQueryKey: (instanceId) => ["radarr", instanceId, "queue"] as const,
  wantedQueryKey: (instanceId) => ["radarr", instanceId, "wanted"] as const,

  // Same key + args as useRadarrQueue, so the widget shares its cache entry.
  fetchQueue: (instanceId) => getQueue(1, 20, true, instanceId),

  toItems: (data, instanceId) =>
    ((data as RadarrQueue).records ?? []).map((item) => {
      // Movie ids aren't globally unique across instances, so the detail link
      // carries the source instance id — the detail screen queries that
      // instance instead of the user's currently-active Radarr.
      const movieId = item.movie?.id ?? item.movieId;
      return {
        id: item.id,
        posterUrl: getRadarrPoster(item.movie?.images),
        title: item.movie?.title || item.title,
        subtitle: item.timeleft ? `ETA ${item.timeleft}` : undefined,
        qualityLabel: item.quality.quality.name,
        progress: item.size > 0 ? (item.size - item.sizeleft) / item.size : 0,
        detailPath: movieId
          ? `/movie/${movieId}?instanceId=${instanceId}`
          : null,
      };
    }),

  fetchWanted: (instanceId) => getWantedMissing(1, 1, instanceId),
  wantedCount: (data) => (data as RadarrWantedMissing).totalRecords ?? 0,
};

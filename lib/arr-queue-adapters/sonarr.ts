import { getQueue, getWantedMissing, getSonarrPoster } from "@/services/sonarr-api";
import type { SonarrQueue, SonarrQueueItem, SonarrWantedMissing } from "@/lib/types";
import type { ArrQueueAdapter } from "@/lib/arr-queue-adapter";

// "S02E05" when the episode is known, else the ETA, else nothing. Gives the
// poster tile the episode context a series poster alone can't convey.
function episodeSubtitle(item: SonarrQueueItem): string | undefined {
  const ep = item.episode;
  if (ep && ep.seasonNumber != null && ep.episodeNumber != null) {
    const s = String(ep.seasonNumber).padStart(2, "0");
    const e = String(ep.episodeNumber).padStart(2, "0");
    return `S${s}E${e}`;
  }
  return item.timeleft ? `ETA ${item.timeleft}` : undefined;
}

export const sonarrArrQueueAdapter: ArrQueueAdapter = {
  serviceId: "sonarr",
  displayName: "Sonarr",
  listRoute: "/(tabs)/tv",
  emptyQueueLabel: "No episodes in queue",
  badgeColor: "rgba(53, 197, 240, 0.9)",
  mediaType: "tv",

  queueQueryKey: (instanceId) => ["sonarr", instanceId, "queue"] as const,
  wantedQueryKey: (instanceId) => ["sonarr", instanceId, "wanted"] as const,

  // Same key + args as useSonarrQueue, so the widget shares its cache entry.
  fetchQueue: (instanceId) => getQueue(1, 20, true, true, instanceId),

  toItems: (data, instanceId) =>
    ((data as SonarrQueue).records ?? []).map((item) => {
      // Series ids aren't globally unique across instances, so the detail link
      // carries the source instance id — the detail screen queries that
      // instance instead of the user's currently-active Sonarr.
      const seriesId = item.seriesId ?? item.series?.id;
      return {
        id: item.id,
        posterUrl: getSonarrPoster(item.series?.images),
        title: item.series?.title || item.title,
        subtitle: episodeSubtitle(item),
        qualityLabel: item.quality.quality.name,
        progress: item.size > 0 ? (item.size - item.sizeleft) / item.size : 0,
        detailPath: seriesId
          ? `/series/${seriesId}?instanceId=${instanceId}`
          : null,
      };
    }),

  fetchWanted: (instanceId) => getWantedMissing(1, 1, instanceId),
  wantedCount: (data) => (data as SonarrWantedMissing).totalRecords ?? 0,
};

import {
  getWantedMissing,
  getSonarrPoster,
  removeFromQueue,
  forceImportQueueItem,
} from "@/services/sonarr-api";
import type { SonarrQueue, SonarrQueueItem, SonarrWantedMissing } from "@/lib/types";
import type { ArrQueueAdapter } from "@/lib/arr-queue-adapter";
import { fetchSonarrQueue } from "@/lib/arr-queue-query";
import { isHeldQueueRecord, queueTileSubtitle } from "@/lib/arr-poster-status";
import { formatEpisodeCode } from "@/lib/utils";
import {
  queueImportBlocked,
  queueIssueMessages,
  queueIssueSeverity,
  queueStatusLabel,
} from "@/lib/arr-queue-issues";

// "S02E05" when the episode is known ("Delayed · S02E05" while Sonarr holds
// it, #484), else the ETA (or "Delayed"), else nothing. Gives the poster tile
// the episode context a series poster alone can't convey.
function episodeSubtitle(item: SonarrQueueItem): string | undefined {
  const ep = item.episode;
  const code =
    ep && ep.seasonNumber != null && ep.episodeNumber != null
      ? formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)
      : undefined;
  return queueTileSubtitle(item, code);
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
  fetchQueue: (instanceId) => fetchSonarrQueue(instanceId),

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
        held: isHeldQueueRecord(item),
        detailPath: seriesId
          ? `/series/${seriesId}?instanceId=${instanceId}`
          : null,
        releaseTitle: item.title,
        severity: queueIssueSeverity(item),
        statusLabel: queueStatusLabel(item),
        messages: queueIssueMessages(item),
        downloadId: item.downloadId,
        canForceImport: queueImportBlocked(item) && !!item.downloadId,
      };
    }),

  fetchWanted: (instanceId) => getWantedMissing(1, 1, instanceId),
  wantedCount: (data) => (data as SonarrWantedMissing).totalRecords ?? 0,

  removeFromQueue: (instanceId, queueId, opts) =>
    removeFromQueue(queueId, opts, instanceId),

  forceImport: (instanceId, downloadId) =>
    forceImportQueueItem(downloadId, instanceId),

  supportsManualImport: true,
};

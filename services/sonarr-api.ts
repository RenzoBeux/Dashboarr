import { serviceRequest } from "@/lib/http-client";
import type {
  SonarrSeries,
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrCalendarEntry,
  SonarrQueue,
  SonarrSearchResult,
  SonarrImage,
  SonarrRelease,
} from "@/lib/types";

const INTERACTIVE_SEARCH_TIMEOUT = 90_000;

// --- Image helpers ---

export function getSonarrPoster(
  images: SonarrImage[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const poster = images.find((i) => i.coverType === "poster");
  // Prefer remoteUrl (TMDB CDN, immutable, fast) over url (local proxy).
  return poster?.remoteUrl || poster?.url || null;
}

export function getSonarrFanart(
  images: SonarrImage[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const fanart = images.find((i) => i.coverType === "fanart");
  return fanart?.remoteUrl || fanart?.url || null;
}

// Per-instance routing: every function takes an optional `instanceId` that
// scopes the request to a specific Sonarr instance. When omitted, the user's
// active Sonarr is used (legacy single-instance behavior).

// --- Series ---

export function getSeries(instanceId?: string): Promise<SonarrSeries[]> {
  return serviceRequest<SonarrSeries[]>("sonarr", "/series", { instanceId });
}

export function getSeriesById(id: number, instanceId?: string): Promise<SonarrSeries> {
  return serviceRequest<SonarrSeries>("sonarr", `/series/${id}`, { instanceId });
}

// --- Episodes ---

export function getEpisodes(
  seriesId: number,
  instanceId?: string,
): Promise<SonarrEpisode[]> {
  return serviceRequest<SonarrEpisode[]>("sonarr", "/episode", {
    params: { seriesId },
    instanceId,
  });
}

export function getEpisode(id: number, instanceId?: string): Promise<SonarrEpisode> {
  return serviceRequest<SonarrEpisode>("sonarr", `/episode/${id}`, { instanceId });
}

// --- Episode Files ---

export function getEpisodeFiles(
  seriesId: number,
  instanceId?: string,
): Promise<SonarrEpisodeFile[]> {
  return serviceRequest<SonarrEpisodeFile[]>("sonarr", "/episodefile", {
    params: { seriesId },
    instanceId,
  });
}

// --- Calendar ---

export function getCalendar(
  startDate: string,
  endDate: string,
  options: { unmonitored?: boolean } = {},
  instanceId?: string,
): Promise<SonarrCalendarEntry[]> {
  return serviceRequest<SonarrCalendarEntry[]>("sonarr", "/calendar", {
    params: {
      start: startDate,
      end: endDate,
      includeSeries: true,
      unmonitored: options.unmonitored ?? false,
    },
    instanceId,
  });
}

// --- Queue ---

export function getQueue(
  page = 1,
  pageSize = 20,
  includeSeries = true,
  includeEpisode = true,
  instanceId?: string,
): Promise<SonarrQueue> {
  return serviceRequest<SonarrQueue>("sonarr", "/queue", {
    params: { page, pageSize, includeSeries, includeEpisode },
    instanceId,
  });
}

// --- Search ---

export function searchSeries(
  term: string,
  instanceId?: string,
): Promise<SonarrSearchResult[]> {
  return serviceRequest<SonarrSearchResult[]>("sonarr", "/series/lookup", {
    params: { term },
    instanceId,
  });
}

// --- Add Series ---

export type SonarrSeriesType = "standard" | "daily" | "anime";

export type SonarrMonitorOption =
  | "all"
  | "future"
  | "missing"
  | "existing"
  | "firstSeason"
  | "lastSeason"
  | "pilot"
  | "recent"
  | "none";

export function addSeries(
  series: {
    tvdbId: number;
    title: string;
    qualityProfileId: number;
    rootFolderPath: string;
    monitored?: boolean;
    seasonFolder?: boolean;
    searchForMissingEpisodes?: boolean;
    searchForCutoffUnmetEpisodes?: boolean;
    seriesType?: SonarrSeriesType;
    monitor?: SonarrMonitorOption;
    tags?: number[];
  },
  instanceId?: string,
): Promise<SonarrSeries> {
  return serviceRequest<SonarrSeries>("sonarr", "/series", {
    method: "POST",
    body: JSON.stringify({
      tvdbId: series.tvdbId,
      title: series.title,
      qualityProfileId: series.qualityProfileId,
      rootFolderPath: series.rootFolderPath,
      monitored: series.monitored ?? true,
      seasonFolder: series.seasonFolder ?? true,
      seriesType: series.seriesType ?? "standard",
      tags: series.tags ?? [],
      addOptions: {
        searchForMissingEpisodes: series.searchForMissingEpisodes ?? true,
        searchForCutoffUnmetEpisodes:
          series.searchForCutoffUnmetEpisodes ?? false,
        monitor: series.monitor ?? "all",
      },
    }),
    instanceId,
  });
}

// --- Delete Series ---

export function deleteSeries(
  id: number,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", `/series/${id}`, {
    method: "DELETE",
    params: { deleteFiles },
    instanceId,
  });
}

// --- Toggle Monitored ---

export function toggleEpisodeMonitored(
  episodeId: number,
  monitored: boolean,
  instanceId?: string,
): Promise<SonarrEpisode> {
  return serviceRequest<SonarrEpisode>("sonarr", `/episode/${episodeId}`, {
    method: "PUT",
    body: JSON.stringify({ monitored }),
    instanceId,
  });
}

export function toggleSeriesMonitored(
  seriesId: number,
  monitored: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", "/series/editor", {
    method: "PUT",
    body: JSON.stringify({ seriesIds: [seriesId], monitored }),
    instanceId,
  });
}

// --- Update Series (full PUT) ---
//
// Sonarr expects the entire series resource on PUT. As with Radarr, we forward
// the cached GET result with the targeted field overridden so unknown fields
// outside our typed subset survive the round-trip.
export function updateSeries(
  series: SonarrSeries,
  instanceId?: string,
): Promise<SonarrSeries> {
  return serviceRequest<SonarrSeries>("sonarr", `/series/${series.id}`, {
    method: "PUT",
    body: JSON.stringify(series),
    instanceId,
  });
}

// --- Search Commands ---

export function searchForSeries(seriesId: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("sonarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "SeriesSearch", seriesId }),
    instanceId,
  });
}

export function searchForEpisodes(
  episodeIds: number[],
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "EpisodeSearch", episodeIds }),
    instanceId,
  });
}

// --- Interactive Release Search & Grab ---

export function getReleasesForEpisode(
  episodeId: number,
  instanceId?: string,
): Promise<SonarrRelease[]> {
  return serviceRequest<SonarrRelease[]>("sonarr", "/release", {
    params: { episodeId },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

export function getReleasesForSeason(
  seriesId: number,
  seasonNumber: number,
  instanceId?: string,
): Promise<SonarrRelease[]> {
  return serviceRequest<SonarrRelease[]>("sonarr", "/release", {
    params: { seriesId, seasonNumber },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

export function grabSonarrRelease(
  guid: string,
  indexerId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", "/release", {
    method: "POST",
    body: JSON.stringify({ guid, indexerId }),
    instanceId,
  });
}

// --- Quality Profiles ---

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

export function getQualityProfiles(
  instanceId?: string,
): Promise<SonarrQualityProfile[]> {
  return serviceRequest<SonarrQualityProfile[]>("sonarr", "/qualityprofile", {
    instanceId,
  });
}

// --- Root Folders ---

export interface SonarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export function getRootFolders(instanceId?: string): Promise<SonarrRootFolder[]> {
  return serviceRequest<SonarrRootFolder[]>("sonarr", "/rootfolder", { instanceId });
}

// --- Tags ---

export interface SonarrTag {
  id: number;
  label: string;
}

export function getTags(instanceId?: string): Promise<SonarrTag[]> {
  return serviceRequest<SonarrTag[]>("sonarr", "/tag", { instanceId });
}

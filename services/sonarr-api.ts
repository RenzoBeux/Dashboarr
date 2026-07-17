import { serviceRequest } from "@/lib/http-client";
import type {
  SonarrSeries,
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrCalendarEntry,
  SonarrQueue,
  SonarrHistory,
  SonarrHistoryRecord,
  SonarrSearchResult,
  SonarrSeriesType,
  SonarrImage,
  SonarrRelease,
  SonarrWantedMissing,
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

export function getSeriesById(
  id: number,
  instanceId?: string,
): Promise<SonarrSeries> {
  return serviceRequest<SonarrSeries>("sonarr", `/series/${id}`, {
    instanceId,
  });
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

export function getEpisode(
  id: number,
  instanceId?: string,
): Promise<SonarrEpisode> {
  return serviceRequest<SonarrEpisode>("sonarr", `/episode/${id}`, {
    instanceId,
  });
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

// Deletes a single episode's downloaded file. The episode stays in the library
// but flips back to missing (hasFile=false).
export function deleteEpisodeFile(
  episodeFileId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", `/episodefile/${episodeFileId}`, {
    method: "DELETE",
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

// --- Wanted / Missing ---

// Aired, monitored episodes without a file, newest first. One page of 100
// covers any dashboard lookback window unless more than 100 episodes went
// missing inside it — an acceptable cap for a widget surface.
export function getWantedMissing(
  page = 1,
  pageSize = 100,
  instanceId?: string,
): Promise<SonarrWantedMissing> {
  return serviceRequest<SonarrWantedMissing>("sonarr", "/wanted/missing", {
    params: {
      page,
      pageSize,
      sortKey: "episodes.airDateUtc",
      sortDirection: "descending",
      includeSeries: true,
      monitored: true,
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

// --- History ---

export function getHistory(
  page = 1,
  pageSize = 50,
  instanceId?: string,
): Promise<SonarrHistory> {
  return serviceRequest<SonarrHistory>("sonarr", "/history", {
    params: {
      page,
      pageSize,
      sortKey: "date",
      sortDirection: "descending",
      includeSeries: true,
      includeEpisode: true,
    },
    instanceId,
  });
}

// Per-episode history: grabs, imports, deletions for one episode. Sonarr only
// exposes episodeId filtering on the paged /history endpoint (the /history/series
// endpoint filters by season, not episode), so we page one large batch and hand
// back the records array. Sorted date-descending by the server.
export function getEpisodeHistory(
  episodeId: number,
  instanceId?: string,
): Promise<SonarrHistoryRecord[]> {
  return serviceRequest<SonarrHistory>("sonarr", "/history", {
    params: {
      episodeId,
      page: 1,
      pageSize: 100,
      sortKey: "date",
      sortDirection: "descending",
      includeSeries: false,
      includeEpisode: false,
    },
    instanceId,
  }).then((res) => res.records);
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

// --- Change Root Folder (via bulk editor endpoint) ---
//
// See Radarr's changeMovieRootFolder for the full rationale. The single PUT
// /series/{id}?moveFiles=true reverts the change: Sonarr derives the move
// destination from the body's stale `path` (no move) and recomputes
// `rootFolderPath` from that unchanged `path` on every GET, so the picked root
// snaps back (issue #83). The editor rewrites `path` from `rootFolderPath`
// server-side. Send ONLY the id + rootFolderPath + moveFiles.
export function changeSeriesRootFolder(
  seriesId: number,
  rootFolderPath: string,
  moveFiles: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", "/series/editor", {
    method: "PUT",
    body: JSON.stringify({ seriesIds: [seriesId], rootFolderPath, moveFiles }),
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
  options?: { moveFiles?: boolean },
): Promise<SonarrSeries> {
  const query = options?.moveFiles ? "?moveFiles=true" : "";
  return serviceRequest<SonarrSeries>(
    "sonarr",
    `/series/${series.id}${query}`,
    {
      method: "PUT",
      body: JSON.stringify(series),
      instanceId,
    },
  );
}

// --- Search Commands ---

export function searchForSeries(
  seriesId: number,
  instanceId?: string,
): Promise<void> {
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

export function searchForSeason(
  seriesId: number,
  seasonNumber: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "SeasonSearch", seriesId, seasonNumber }),
    instanceId,
  });
}

// Searches every monitored missing episode in the library. With no params the
// MissingEpisodeSearch command defaults to Monitored across all series — the
// equivalent of Sonarr's Wanted › Missing › "Search All" button.
export function searchAllMissingEpisodes(instanceId?: string): Promise<void> {
  return serviceRequest<void>("sonarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "MissingEpisodeSearch" }),
    instanceId,
  });
}

// --- Interactive Release Search & Grab ---

export function getReleasesForEpisode(
  episodeId: number,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<SonarrRelease[]> {
  return serviceRequest<SonarrRelease[]>("sonarr", "/release", {
    params: { episodeId },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
    signal,
  });
}

export function getReleasesForSeason(
  seriesId: number,
  seasonNumber: number,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<SonarrRelease[]> {
  return serviceRequest<SonarrRelease[]>("sonarr", "/release", {
    params: { seriesId, seasonNumber },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
    signal,
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

export function getRootFolders(
  instanceId?: string,
): Promise<SonarrRootFolder[]> {
  return serviceRequest<SonarrRootFolder[]>("sonarr", "/rootfolder", {
    instanceId,
  });
}

// --- Tags ---

export interface SonarrTag {
  id: number;
  label: string;
}

export function getTags(instanceId?: string): Promise<SonarrTag[]> {
  return serviceRequest<SonarrTag[]>("sonarr", "/tag", { instanceId });
}

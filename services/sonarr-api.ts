import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import type {
  SonarrSeries,
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrCalendarEntry,
  SonarrQueue,
  SonarrManualImportItem,
  SonarrHistory,
  SonarrHistoryRecord,
  SonarrSearchResult,
  SonarrSeriesType,
  SonarrImage,
  SonarrRelease,
  SonarrWantedMissing,
  ArrQueueRemoveOptions,
} from "@/lib/types";

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

// Bulk file delete — the endpoint behind Sonarr's own "delete selected files",
// used here to clear a whole season in one request instead of N per-file
// DELETEs. Present since Sonarr v3 (Sonarr.Api.V3 EpisodeFileModule:
// `Delete("/bulk")` reading an EpisodeFileListResource).
// Never call with an empty list: Sonarr resolves the series from
// `episodeFiles.First()` and throws on an empty match.
export function deleteEpisodeFiles(
  episodeFileIds: number[],
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", "/episodefile/bulk", {
    method: "DELETE",
    body: JSON.stringify({ episodeFileIds }),
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

// `includeUnknownSeriesItems` matters for the queue-issues banner (#285): a
// grab whose series was deleted from the library is exactly the kind that gets
// stuck, and Sonarr hides those by default. The page size is generous for a
// related reason: the effective default sort is `timeleft` *descending* (the
// controller's ascending default only applies to SortDirection.Default, and an
// omitted direction deserializes to Descending), and TimeleftComparer ranks a
// missing timeleft highest — so blocked and pending items crowd the front of
// page 1 and a small page clips the live downloads off the back. Callers must
// go through lib/arr-queue-query, which owns the shared cache entry's args.
export function getQueue(
  page = 1,
  pageSize = 100,
  includeSeries = true,
  includeEpisode = true,
  instanceId?: string,
): Promise<SonarrQueue> {
  return serviceRequest<SonarrQueue>("sonarr", "/queue", {
    params: {
      page,
      pageSize,
      includeSeries,
      includeEpisode,
      includeUnknownSeriesItems: true,
    },
    instanceId,
  });
}

/**
 * Removes a queue item. See ArrQueueRemoveOptions for what the flags do; the
 * defaults match Sonarr's own (`removeFromClient=true`, no blocklist).
 */
export function removeFromQueue(
  queueId: number,
  opts: ArrQueueRemoveOptions = {},
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("sonarr", `/queue/${queueId}`, {
    method: "DELETE",
    params: {
      removeFromClient: opts.removeFromClient ?? true,
      blocklist: opts.blocklist ?? false,
      skipRedownload: opts.skipRedownload ?? false,
    },
    instanceId,
  });
}

// --- Force import (#325) ---

// The import candidates Sonarr matched for a completed download — the same
// list its own Manual Import screen shows. `filterExistingFiles: false` so
// nothing the scan found is hidden from the eligibility check below.
function getManualImportItems(
  downloadId: string,
  instanceId?: string,
): Promise<SonarrManualImportItem[]> {
  return serviceRequest<SonarrManualImportItem[]>("sonarr", "/manualimport", {
    params: { downloadId, filterExistingFiles: false },
    instanceId,
  });
}

/**
 * Imports a completed download Sonarr refused to import ("Import blocked",
 * typically a grab-anyway release that isn't a quality upgrade), replacing the
 * existing episode files. The app-side equivalent of desktop Manual Import:
 * fetch Sonarr's own candidates for the download, then issue a ManualImport
 * command for every file it identified — the command imports regardless of
 * rejections, which is the "force". File payload mirrors Sonarr's web UI
 * (InteractiveImportModalContent). Only files Sonarr mapped to episodes with a
 * parsed quality qualify; anything unidentified needs the desktop screen's
 * manual mapping, so with no qualifying file this rejects instead of silently
 * importing nothing.
 */
export async function forceImportQueueItem(
  downloadId: string,
  instanceId?: string,
): Promise<void> {
  const candidates = await getManualImportItems(downloadId, instanceId);
  const files = candidates
    .filter((c) => c.path && c.series && c.episodes?.length && c.quality)
    .map((c) => ({
      path: c.path,
      folderName: c.folderName,
      seriesId: c.series!.id,
      episodeIds: c.episodes!.map((e) => e.id),
      quality: c.quality,
      languages: c.languages ?? [],
      releaseGroup: c.releaseGroup,
      indexerFlags: c.indexerFlags ?? 0,
      releaseType: c.releaseType,
      episodeFileId: c.episodeFileId,
      downloadId,
    }));
  if (files.length === 0) {
    throw new Error(
      "Sonarr couldn't match this download to any episode. Use Manual Import in Sonarr to map it.",
    );
  }
  return serviceRequest<void>("sonarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "ManualImport", files, importMode: "auto" }),
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

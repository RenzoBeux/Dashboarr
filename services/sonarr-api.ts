import { serviceRequest } from "@/lib/http-client";
import type {
  SonarrSeries,
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrCalendarEntry,
  SonarrQueue,
  SonarrSearchResult,
} from "@/lib/types";

// --- Series ---

export function getSeries(): Promise<SonarrSeries[]> {
  return serviceRequest<SonarrSeries[]>("sonarr", "/series");
}

export function getSeriesById(id: number): Promise<SonarrSeries> {
  return serviceRequest<SonarrSeries>("sonarr", `/series/${id}`);
}

// --- Episodes ---

export function getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
  return serviceRequest<SonarrEpisode[]>("sonarr", "/episode", {
    params: { seriesId },
  });
}

export function getEpisode(id: number): Promise<SonarrEpisode> {
  return serviceRequest<SonarrEpisode>("sonarr", `/episode/${id}`);
}

// --- Episode Files ---

export function getEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
  return serviceRequest<SonarrEpisodeFile[]>("sonarr", "/episodefile", {
    params: { seriesId },
  });
}

// --- Calendar ---

export function getCalendar(
  startDate: string,
  endDate: string,
): Promise<SonarrCalendarEntry[]> {
  return serviceRequest<SonarrCalendarEntry[]>("sonarr", "/calendar", {
    params: { start: startDate, end: endDate, includeSeries: true },
  });
}

// --- Queue ---

export function getQueue(
  page = 1,
  pageSize = 20,
  includeSeries = true,
  includeEpisode = true,
): Promise<SonarrQueue> {
  return serviceRequest<SonarrQueue>("sonarr", "/queue", {
    params: { page, pageSize, includeSeries, includeEpisode },
  });
}

// --- Search ---

export function searchSeries(term: string): Promise<SonarrSearchResult[]> {
  return serviceRequest<SonarrSearchResult[]>("sonarr", "/series/lookup", {
    params: { term },
  });
}

// --- Add Series ---

export function addSeries(series: {
  tvdbId: number;
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored?: boolean;
  seasonFolder?: boolean;
  searchForMissingEpisodes?: boolean;
}): Promise<SonarrSeries> {
  return serviceRequest<SonarrSeries>("sonarr", "/series", {
    method: "POST",
    body: JSON.stringify({
      tvdbId: series.tvdbId,
      title: series.title,
      qualityProfileId: series.qualityProfileId,
      rootFolderPath: series.rootFolderPath,
      monitored: series.monitored ?? true,
      seasonFolder: series.seasonFolder ?? true,
      addOptions: {
        searchForMissingEpisodes: series.searchForMissingEpisodes ?? true,
      },
    }),
  });
}

// --- Delete Series ---

export function deleteSeries(
  id: number,
  deleteFiles = false,
): Promise<void> {
  return serviceRequest<void>("sonarr", `/series/${id}`, {
    method: "DELETE",
    params: { deleteFiles },
  });
}

// --- Toggle Monitored ---

export function toggleEpisodeMonitored(
  episodeId: number,
  monitored: boolean,
): Promise<SonarrEpisode> {
  return serviceRequest<SonarrEpisode>("sonarr", `/episode/${episodeId}`, {
    method: "PUT",
    body: JSON.stringify({ monitored }),
  });
}

// --- Quality Profiles ---

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

export function getQualityProfiles(): Promise<SonarrQualityProfile[]> {
  return serviceRequest<SonarrQualityProfile[]>("sonarr", "/qualityprofile");
}

// --- Root Folders ---

export interface SonarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export function getRootFolders(): Promise<SonarrRootFolder[]> {
  return serviceRequest<SonarrRootFolder[]>("sonarr", "/rootfolder");
}

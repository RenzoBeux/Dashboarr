import { serviceRequest } from "@/lib/http-client";
import type {
  RadarrMovie,
  RadarrQueue,
  RadarrWantedMissing,
  RadarrSearchResult,
} from "@/lib/types";

// --- Movies ---

export function getMovies(): Promise<RadarrMovie[]> {
  return serviceRequest<RadarrMovie[]>("radarr", "/movie");
}

export function getMovie(id: number): Promise<RadarrMovie> {
  return serviceRequest<RadarrMovie>("radarr", `/movie/${id}`);
}

// --- Queue ---

export function getQueue(
  page = 1,
  pageSize = 20,
  includeMovie = true,
): Promise<RadarrQueue> {
  return serviceRequest<RadarrQueue>("radarr", "/queue", {
    params: { page, pageSize, includeMovie },
  });
}

// --- Wanted / Missing ---

export function getWantedMissing(
  page = 1,
  pageSize = 1,
): Promise<RadarrWantedMissing> {
  return serviceRequest<RadarrWantedMissing>("radarr", "/wanted/missing", {
    params: { page, pageSize, sortKey: "movieMetadata.sortTitle", sortDirection: "ascending" },
  });
}

// --- Search ---

export function searchMovies(term: string): Promise<RadarrSearchResult[]> {
  return serviceRequest<RadarrSearchResult[]>("radarr", "/movie/lookup", {
    params: { term },
  });
}

// --- Add Movie ---

export type RadarrMinimumAvailability =
  | "announced"
  | "inCinemas"
  | "released";

export type RadarrMonitorOption =
  | "movieOnly"
  | "movieAndCollection"
  | "none";

export function addMovie(movie: {
  tmdbId: number;
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored?: boolean;
  searchForMovie?: boolean;
  minimumAvailability?: RadarrMinimumAvailability;
  monitor?: RadarrMonitorOption;
  tags?: number[];
}): Promise<RadarrMovie> {
  return serviceRequest<RadarrMovie>("radarr", "/movie", {
    method: "POST",
    body: JSON.stringify({
      tmdbId: movie.tmdbId,
      title: movie.title,
      qualityProfileId: movie.qualityProfileId,
      rootFolderPath: movie.rootFolderPath,
      monitored: movie.monitored ?? true,
      minimumAvailability: movie.minimumAvailability ?? "released",
      tags: movie.tags ?? [],
      addOptions: {
        searchForMovie: movie.searchForMovie ?? true,
        monitor: movie.monitor ?? "movieOnly",
      },
    }),
  });
}

// --- Delete Movie ---

export function deleteMovie(
  id: number,
  deleteFiles = false,
): Promise<void> {
  return serviceRequest<void>("radarr", `/movie/${id}`, {
    method: "DELETE",
    params: { deleteFiles },
  });
}

// --- Search Command ---

export function searchForMovie(movieId: number): Promise<void> {
  return serviceRequest<void>("radarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "MoviesSearch", movieIds: [movieId] }),
  });
}

// --- Toggle Monitored (via bulk editor endpoint) ---

export function toggleMovieMonitored(
  movieId: number,
  monitored: boolean,
): Promise<void> {
  return serviceRequest<void>("radarr", "/movie/editor", {
    method: "PUT",
    body: JSON.stringify({ movieIds: [movieId], monitored }),
  });
}

// --- Calendar ---

export function getCalendar(
  startDate: string,
  endDate: string,
): Promise<RadarrMovie[]> {
  return serviceRequest<RadarrMovie[]>("radarr", "/calendar", {
    params: { start: startDate, end: endDate },
  });
}

// --- Quality Profiles ---

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export function getQualityProfiles(): Promise<RadarrQualityProfile[]> {
  return serviceRequest<RadarrQualityProfile[]>("radarr", "/qualityprofile");
}

// --- Root Folders ---

export interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export function getRootFolders(): Promise<RadarrRootFolder[]> {
  return serviceRequest<RadarrRootFolder[]>("radarr", "/rootfolder");
}

// --- Tags ---

export interface RadarrTag {
  id: number;
  label: string;
}

export function getTags(): Promise<RadarrTag[]> {
  return serviceRequest<RadarrTag[]>("radarr", "/tag");
}

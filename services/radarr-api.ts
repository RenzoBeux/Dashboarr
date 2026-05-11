import { serviceRequest } from "@/lib/http-client";
import type {
  RadarrMovie,
  RadarrQueue,
  RadarrWantedMissing,
  RadarrSearchResult,
  RadarrImage,
  RadarrRelease,
} from "@/lib/types";

// Interactive search hits indexers live and frequently exceeds the 15s
// default timeout. Bump per-call to keep slow indexers from short-circuiting
// the whole search.
const INTERACTIVE_SEARCH_TIMEOUT = 90_000;

// --- Image helpers ---

export function getRadarrPoster(
  images: RadarrImage[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const poster = images.find((i) => i.coverType === "poster");
  // Prefer remoteUrl (TMDB CDN, immutable, fast) over url (local proxy).
  return poster?.remoteUrl || poster?.url || null;
}

export function getRadarrFanart(
  images: RadarrImage[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const fanart = images.find((i) => i.coverType === "fanart");
  return fanart?.remoteUrl || fanart?.url || null;
}

// Per-instance routing: every function takes an optional `instanceId` that
// scopes the request to a specific Radarr instance. When omitted, the user's
// active Radarr instance is used (legacy single-instance behavior).

// --- Movies ---

export function getMovies(instanceId?: string): Promise<RadarrMovie[]> {
  return serviceRequest<RadarrMovie[]>("radarr", "/movie", { instanceId });
}

export function getMovie(id: number, instanceId?: string): Promise<RadarrMovie> {
  return serviceRequest<RadarrMovie>("radarr", `/movie/${id}`, { instanceId });
}

// --- Queue ---

export function getQueue(
  page = 1,
  pageSize = 20,
  includeMovie = true,
  instanceId?: string,
): Promise<RadarrQueue> {
  return serviceRequest<RadarrQueue>("radarr", "/queue", {
    params: { page, pageSize, includeMovie },
    instanceId,
  });
}

// --- Wanted / Missing ---

export function getWantedMissing(
  page = 1,
  pageSize = 1,
  instanceId?: string,
): Promise<RadarrWantedMissing> {
  return serviceRequest<RadarrWantedMissing>("radarr", "/wanted/missing", {
    params: { page, pageSize, sortKey: "movieMetadata.sortTitle", sortDirection: "ascending" },
    instanceId,
  });
}

// --- Search ---

export function searchMovies(
  term: string,
  instanceId?: string,
): Promise<RadarrSearchResult[]> {
  return serviceRequest<RadarrSearchResult[]>("radarr", "/movie/lookup", {
    params: { term },
    instanceId,
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

export function addMovie(
  movie: {
    tmdbId: number;
    title: string;
    qualityProfileId: number;
    rootFolderPath: string;
    monitored?: boolean;
    searchForMovie?: boolean;
    minimumAvailability?: RadarrMinimumAvailability;
    monitor?: RadarrMonitorOption;
    tags?: number[];
  },
  instanceId?: string,
): Promise<RadarrMovie> {
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
    instanceId,
  });
}

// --- Delete Movie ---

export function deleteMovie(
  id: number,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("radarr", `/movie/${id}`, {
    method: "DELETE",
    params: { deleteFiles },
    instanceId,
  });
}

// --- Search Command ---

export function searchForMovie(movieId: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("radarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "MoviesSearch", movieIds: [movieId] }),
    instanceId,
  });
}

// --- Interactive Release Search & Grab ---

export function getReleasesForMovie(
  movieId: number,
  instanceId?: string,
): Promise<RadarrRelease[]> {
  return serviceRequest<RadarrRelease[]>("radarr", "/release", {
    params: { movieId },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

export function grabRadarrRelease(
  guid: string,
  indexerId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("radarr", "/release", {
    method: "POST",
    body: JSON.stringify({ guid, indexerId }),
    instanceId,
  });
}

// --- Toggle Monitored (via bulk editor endpoint) ---

export function toggleMovieMonitored(
  movieId: number,
  monitored: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("radarr", "/movie/editor", {
    method: "PUT",
    body: JSON.stringify({ movieIds: [movieId], monitored }),
    instanceId,
  });
}

// --- Update Movie (full PUT) ---
//
// Radarr expects the entire movie resource on PUT. Our `RadarrMovie` type is a
// subset of the API response, but because we always pass the cached GET result
// through (spread + override), every runtime field is preserved.
export function updateMovie(
  movie: RadarrMovie,
  instanceId?: string,
  options?: { moveFiles?: boolean },
): Promise<RadarrMovie> {
  const query = options?.moveFiles ? "?moveFiles=true" : "";
  return serviceRequest<RadarrMovie>("radarr", `/movie/${movie.id}${query}`, {
    method: "PUT",
    body: JSON.stringify(movie),
    instanceId,
  });
}

// --- Calendar ---

export function getCalendar(
  startDate: string,
  endDate: string,
  options: { unmonitored?: boolean } = {},
  instanceId?: string,
): Promise<RadarrMovie[]> {
  return serviceRequest<RadarrMovie[]>("radarr", "/calendar", {
    params: {
      start: startDate,
      end: endDate,
      unmonitored: options.unmonitored ?? false,
    },
    instanceId,
  });
}

// --- Quality Profiles ---

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export function getQualityProfiles(
  instanceId?: string,
): Promise<RadarrQualityProfile[]> {
  return serviceRequest<RadarrQualityProfile[]>("radarr", "/qualityprofile", {
    instanceId,
  });
}

// --- Root Folders ---

export interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export function getRootFolders(instanceId?: string): Promise<RadarrRootFolder[]> {
  return serviceRequest<RadarrRootFolder[]>("radarr", "/rootfolder", { instanceId });
}

// --- Tags ---

export interface RadarrTag {
  id: number;
  label: string;
}

export function getTags(instanceId?: string): Promise<RadarrTag[]> {
  return serviceRequest<RadarrTag[]>("radarr", "/tag", { instanceId });
}

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

// --- Interactive Release Search & Grab ---

export function getReleasesForMovie(movieId: number): Promise<RadarrRelease[]> {
  return serviceRequest<RadarrRelease[]>("radarr", "/release", {
    params: { movieId },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
  });
}

export function grabRadarrRelease(
  guid: string,
  indexerId: number,
): Promise<void> {
  return serviceRequest<void>("radarr", "/release", {
    method: "POST",
    body: JSON.stringify({ guid, indexerId }),
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
  options: { unmonitored?: boolean } = {},
): Promise<RadarrMovie[]> {
  return serviceRequest<RadarrMovie[]>("radarr", "/calendar", {
    params: {
      start: startDate,
      end: endDate,
      unmonitored: options.unmonitored ?? false,
    },
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

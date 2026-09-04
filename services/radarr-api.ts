import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import type {
  RadarrMovie,
  RadarrQueue,
  RadarrManualImportItem,
  RadarrHistory,
  RadarrHistoryRecord,
  RadarrWantedMissing,
  RadarrSearchResult,
  RadarrImage,
  RadarrRelease,
  RadarrCollection,
  ArrQueueRemoveOptions,
} from "@/lib/types";

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

// --- Collections ---

// Radarr filters /collection by the COLLECTION's TMDB id (the `collection`
// field on a movie resource). The endpoint always returns an array; match on
// tmdbId defensively and fall back to the first element. Returns null (not
// undefined — TanStack Query rejects undefined) when Radarr knows nothing
// about the collection.
export function getCollectionByTmdbId(
  collectionTmdbId: number,
  instanceId?: string,
): Promise<RadarrCollection | null> {
  return serviceRequest<RadarrCollection[]>("radarr", "/collection", {
    params: { tmdbId: collectionTmdbId },
    instanceId,
  }).then(
    (list) => list.find((c) => c.tmdbId === collectionTmdbId) ?? list[0] ?? null,
  );
}

// --- Queue ---

// `includeUnknownMovieItems` matters for the queue-issues banner (#285): a
// grab whose movie was deleted from the library is exactly the kind that gets
// stuck, and Radarr hides those by default. The page size is generous for a
// related reason: the effective default sort is `timeleft` *descending* (the
// controller's ascending default only applies to SortDirection.Default, and an
// omitted direction deserializes to Descending), and TimeleftComparer ranks a
// missing timeleft highest — so blocked and pending items crowd the front of
// page 1 and a small page clips the live downloads off the back. Callers must
// go through lib/arr-queue-query, which owns the shared cache entry's args.
export function getQueue(
  page = 1,
  pageSize = 100,
  includeMovie = true,
  instanceId?: string,
): Promise<RadarrQueue> {
  return serviceRequest<RadarrQueue>("radarr", "/queue", {
    params: { page, pageSize, includeMovie, includeUnknownMovieItems: true },
    instanceId,
  });
}

/**
 * Removes a queue item. See ArrQueueRemoveOptions for what the flags do; the
 * defaults match Radarr's own (`removeFromClient=true`, no blocklist).
 */
export function removeFromQueue(
  queueId: number,
  opts: ArrQueueRemoveOptions = {},
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("radarr", `/queue/${queueId}`, {
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

// The import candidates Radarr matched for a completed download — the same
// list its own Manual Import screen shows. `filterExistingFiles: false` so
// nothing the scan found is hidden from the eligibility check below.
function getManualImportItems(
  downloadId: string,
  instanceId?: string,
): Promise<RadarrManualImportItem[]> {
  return serviceRequest<RadarrManualImportItem[]>("radarr", "/manualimport", {
    params: { downloadId, filterExistingFiles: false },
    instanceId,
  });
}

/**
 * Imports a completed download Radarr refused to import ("Import blocked",
 * typically a grab-anyway release that isn't a quality upgrade), replacing the
 * existing movie file. The app-side equivalent of desktop Manual Import: fetch
 * Radarr's own candidates for the download, then issue a ManualImport command
 * for every file it identified — the command imports regardless of rejections,
 * which is the "force". File payload mirrors Radarr's web UI
 * (InteractiveImportModalContent). Only files Radarr matched to a movie with a
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
    .filter((c) => c.path && c.movie && c.quality)
    .map((c) => ({
      path: c.path,
      folderName: c.folderName,
      movieId: c.movie!.id,
      quality: c.quality,
      languages: c.languages ?? [],
      releaseGroup: c.releaseGroup,
      indexerFlags: c.indexerFlags ?? 0,
      downloadId,
    }));
  if (files.length === 0) {
    throw new Error(
      "Radarr couldn't match this download to a movie. Use Manual Import in Radarr to map it.",
    );
  }
  return serviceRequest<void>("radarr", "/command", {
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
): Promise<RadarrHistory> {
  return serviceRequest<RadarrHistory>("radarr", "/history", {
    params: {
      page,
      pageSize,
      sortKey: "date",
      sortDirection: "descending",
      includeMovie: true,
    },
    instanceId,
  });
}

// Per-movie history: grabs, imports, deletions for a single movie. Unlike the
// global /history above this endpoint returns a plain array (not paged) and is
// sorted date-descending by the server. includeMovie:false keeps the payload
// lean since the caller already has the movie.
export function getMovieHistory(
  movieId: number,
  instanceId?: string,
): Promise<RadarrHistoryRecord[]> {
  return serviceRequest<RadarrHistoryRecord[]>("radarr", "/history/movie", {
    params: { movieId, includeMovie: false },
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

// Walks every page of the wanted/missing list. getWantedMissing above is the
// cheap count-only call used for dashboard badges; this one fetches page 1 to
// learn the total, then pulls the remaining pages in parallel and concatenates
// them so the Wanted view shows the complete list, not a single page (issue #156).
export async function getAllWantedMissing(
  instanceId?: string,
): Promise<RadarrWantedMissing> {
  const pageSize = 100;
  const first = await getWantedMissing(1, pageSize, instanceId);
  const totalPages = Math.max(1, Math.ceil(first.totalRecords / pageSize));
  if (totalPages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      getWantedMissing(i + 2, pageSize, instanceId),
    ),
  );
  const records = rest.reduce(
    (acc, page) => acc.concat(page.records),
    [...first.records],
  );
  return { ...first, pageSize: records.length, records };
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

// Searches every monitored missing movie. With no FilterKey/FilterValue the
// MissingMoviesSearch command defaults to all monitored missing movies — the
// equivalent of Radarr's Wanted › Missing › "Search All" button (mirrors
// Sonarr's searchAllMissingEpisodes).
export function searchAllMissingMovies(instanceId?: string): Promise<void> {
  return serviceRequest<void>("radarr", "/command", {
    method: "POST",
    body: JSON.stringify({ name: "MissingMoviesSearch" }),
    instanceId,
  });
}

// --- Interactive Release Search & Grab ---

export function getReleasesForMovie(
  movieId: number,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<RadarrRelease[]> {
  return serviceRequest<RadarrRelease[]>("radarr", "/release", {
    params: { movieId },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
    signal,
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

// --- Change Root Folder (via bulk editor endpoint) ---
//
// The single PUT /movie/{id}?moveFiles=true does NOT work for a root-folder
// change: it derives the move destination from the body's stale `path` (so
// source == destination, no move) and the single-movie save overload never
// recomputes `path` from the new `rootFolderPath` — leaving an inconsistent
// record that "reverts" to the old location on the next GET (issue #83). The
// editor endpoint derives the destination from `rootFolderPath` server-side and
// rewrites `path` consistently. Send ONLY the id + rootFolderPath + moveFiles —
// never echo back the old `path`. moveFiles:false still changes the root (Path
// rebuilt under the new root, files left in place); moveFiles:true also moves.
export function changeMovieRootFolder(
  movieId: number,
  rootFolderPath: string,
  moveFiles: boolean,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("radarr", "/movie/editor", {
    method: "PUT",
    body: JSON.stringify({ movieIds: [movieId], rootFolderPath, moveFiles }),
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

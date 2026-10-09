import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import type {
  BazarrHistoryResponse,
  BazarrMissingSubtitle,
  BazarrProvider,
  BazarrWantedEpisodesResponse,
  BazarrWantedMoviesResponse,
} from "@/lib/types";

// Per-instance routing: every function takes an optional `instanceId`.

// --- Wanted (missing subtitles) ---

export function getWantedMovies(
  start = 0,
  length = 50,
  instanceId?: string,
): Promise<BazarrWantedMoviesResponse> {
  return serviceRequest<BazarrWantedMoviesResponse>(
    "bazarr",
    "/movies/wanted",
    {
      params: { start, length },
      instanceId,
    },
  );
}

export function getWantedEpisodes(
  start = 0,
  length = 50,
  instanceId?: string,
): Promise<BazarrWantedEpisodesResponse> {
  return serviceRequest<BazarrWantedEpisodesResponse>(
    "bazarr",
    "/episodes/wanted",
    {
      params: { start, length },
      instanceId,
    },
  );
}

// --- History ---

export function getMovieHistory(
  start = 0,
  length = 25,
  instanceId?: string,
): Promise<BazarrHistoryResponse> {
  return serviceRequest<BazarrHistoryResponse>("bazarr", "/movies/history", {
    params: { start, length },
    instanceId,
  });
}

export function getEpisodeHistory(
  start = 0,
  length = 25,
  instanceId?: string,
): Promise<BazarrHistoryResponse> {
  return serviceRequest<BazarrHistoryResponse>("bazarr", "/episodes/history", {
    params: { start, length },
    instanceId,
  });
}

// --- Providers ---

export function getProviders(instanceId?: string): Promise<BazarrProvider[]> {
  return serviceRequest<BazarrProvider[]>("bazarr", "/providers", {
    instanceId,
  });
}

// --- Manual search triggers ---

// Before 1.5.6 Bazarr only answers a search PATCH once the search has finished
// (1.5.4/1.5.5 queue a job but still wait on it), so the default timeout would
// report a failure while the search carries on server-side.

// The wanted route is GET-only; movie actions are PATCHed on the movie resource.
export function searchWantedMovie(
  radarrid: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bazarr", "/movies", {
    method: "PATCH",
    body: JSON.stringify({ radarrid, action: "search-missing" }),
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

// /episodes/wanted is GET-only too (PATCH answers 405), and there is no
// episode-level "search-missing" action. Bazarr's own Wanted page searches an
// episode with one PATCH on /episodes/subtitles per missing language, all
// query params; `forced`/`hi` are read as the strings "True"/"False".
export async function searchWantedEpisode(
  sonarrSeriesId: number,
  sonarrEpisodeId: number,
  languages: BazarrMissingSubtitle[],
  instanceId?: string,
): Promise<void> {
  // Fired in parallel: a slow (blocking) search on one language must not hold
  // back the rest. Only a total failure is surfaced.
  const results = await Promise.allSettled(
    languages.map((lang) =>
      serviceRequest<void>("bazarr", "/episodes/subtitles", {
        method: "PATCH",
        params: {
          seriesid: sonarrSeriesId,
          episodeid: sonarrEpisodeId,
          language: lang.code2,
          forced: lang.forced ? "True" : "False",
          hi: lang.hi ? "True" : "False",
        },
        timeout: INTERACTIVE_SEARCH_TIMEOUT,
        instanceId,
      }),
    ),
  );
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failures.length > 0 && failures.length === results.length) {
    throw failures[0].reason;
  }
}

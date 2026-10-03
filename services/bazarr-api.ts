import { serviceRequest } from "@/lib/http-client";
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

// The wanted route is GET-only; movie actions are PATCHed on the movie resource.
export function searchWantedMovie(
  radarrid: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bazarr", "/movies", {
    method: "PATCH",
    body: JSON.stringify({ radarrid, action: "search-missing" }),
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
  for (const lang of languages) {
    await serviceRequest<void>("bazarr", "/episodes/subtitles", {
      method: "PATCH",
      params: {
        seriesid: sonarrSeriesId,
        episodeid: sonarrEpisodeId,
        language: lang.code2,
        forced: lang.forced ? "True" : "False",
        hi: lang.hi ? "True" : "False",
      },
      instanceId,
    });
  }
}

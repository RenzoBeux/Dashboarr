import { serviceRequest } from "@/lib/http-client";
import type {
  BazarrHistoryResponse,
  BazarrProvider,
  BazarrWantedEpisodesResponse,
  BazarrWantedMoviesResponse,
} from "@/lib/types";

// --- Wanted (missing subtitles) ---

export function getWantedMovies(
  start = 0,
  length = 50,
): Promise<BazarrWantedMoviesResponse> {
  return serviceRequest<BazarrWantedMoviesResponse>("bazarr", "/movies/wanted", {
    params: { start, length },
  });
}

export function getWantedEpisodes(
  start = 0,
  length = 50,
): Promise<BazarrWantedEpisodesResponse> {
  return serviceRequest<BazarrWantedEpisodesResponse>("bazarr", "/episodes/wanted", {
    params: { start, length },
  });
}

// --- History ---

export function getMovieHistory(
  start = 0,
  length = 25,
): Promise<BazarrHistoryResponse> {
  return serviceRequest<BazarrHistoryResponse>("bazarr", "/history/movies", {
    params: { start, length },
  });
}

export function getEpisodeHistory(
  start = 0,
  length = 25,
): Promise<BazarrHistoryResponse> {
  return serviceRequest<BazarrHistoryResponse>("bazarr", "/history/series", {
    params: { start, length },
  });
}

// --- Providers ---

export function getProviders(): Promise<BazarrProvider[]> {
  return serviceRequest<BazarrProvider[]>("bazarr", "/providers");
}

// --- Manual search triggers ---
// Bazarr uses PATCH on the wanted endpoints with an action body to trigger a search.

export function searchWantedMovie(radarrid: number): Promise<void> {
  return serviceRequest<void>("bazarr", "/movies/wanted", {
    method: "PATCH",
    body: JSON.stringify({ radarrid, action: "search-missing" }),
  });
}

export function searchWantedEpisode(
  sonarrSeriesId: number,
  sonarrEpisodeId: number,
): Promise<void> {
  return serviceRequest<void>("bazarr", "/episodes/wanted", {
    method: "PATCH",
    body: JSON.stringify({
      seriesid: sonarrSeriesId,
      episodeid: sonarrEpisodeId,
      action: "search-missing",
    }),
  });
}

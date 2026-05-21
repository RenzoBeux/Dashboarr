import { serviceRequest } from "@/lib/http-client";
import type {
  BazarrHistoryResponse,
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
  return serviceRequest<BazarrWantedMoviesResponse>("bazarr", "/movies/wanted", {
    params: { start, length },
    instanceId,
  });
}

export function getWantedEpisodes(
  start = 0,
  length = 50,
  instanceId?: string,
): Promise<BazarrWantedEpisodesResponse> {
  return serviceRequest<BazarrWantedEpisodesResponse>("bazarr", "/episodes/wanted", {
    params: { start, length },
    instanceId,
  });
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
  return serviceRequest<BazarrProvider[]>("bazarr", "/providers", { instanceId });
}

// --- Manual search triggers ---
// Bazarr uses PATCH on the wanted endpoints with an action body to trigger a search.

export function searchWantedMovie(radarrid: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("bazarr", "/movies/wanted", {
    method: "PATCH",
    body: JSON.stringify({ radarrid, action: "search-missing" }),
    instanceId,
  });
}

export function searchWantedEpisode(
  sonarrSeriesId: number,
  sonarrEpisodeId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bazarr", "/episodes/wanted", {
    method: "PATCH",
    body: JSON.stringify({
      seriesid: sonarrSeriesId,
      episodeid: sonarrEpisodeId,
      action: "search-missing",
    }),
    instanceId,
  });
}

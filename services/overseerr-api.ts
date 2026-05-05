import { serviceRequest } from "@/lib/http-client";
import type {
  OverseerrRequestsResponse,
  OverseerrSearchResponse,
  OverseerrRequest,
  OverseerrRequestCount,
  OverseerrTrendingResult,
  OverseerrMovieDetails,
  OverseerrTVDetails,
  OverseerrServerInfo,
  OverseerrServerDetails,
} from "@/lib/types";

export interface OverseerrRequestOptions {
  serverId?: number;
  profileId?: number;
  rootFolder?: string;
  tags?: number[];
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// --- Requests ---

// Overseerr's OpenAPI schema rejects unknown query params via
// express-openapi-validator. `sortDirection` isn't declared, so sending it
// 500s the request — the server only ever sorts DESC.
export function getRequests(
  page = 1,
  pageSize = 20,
  filter?: "all" | "approved" | "pending" | "processing" | "available",
  sort: "added" | "modified" = "added",
): Promise<OverseerrRequestsResponse> {
  return serviceRequest<OverseerrRequestsResponse>("overseerr", "/request", {
    params: {
      take: pageSize,
      skip: (page - 1) * pageSize,
      sort,
      ...(filter && filter !== "all" ? { filter } : {}),
    },
  });
}

export function getRequestCount(): Promise<OverseerrRequestCount> {
  return serviceRequest<OverseerrRequestCount>("overseerr", "/request/count");
}

// --- Search ---

export function searchMedia(
  query: string,
  page = 1,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/search", {
    params: { query, page },
  });
}

// --- Trending / Discover ---

export function getTrending(page = 1): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/trending", {
    params: { page },
  });
}

export function getPopularMovies(page = 1): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/movies", {
    params: { page },
  });
}

export function getPopularTV(page = 1): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/tv", {
    params: { page },
  });
}

export function getUpcomingMovies(page = 1): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/movies/upcoming", {
    params: { page },
  });
}

export function getRecentlyAdded(): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/recently-added");
}

// --- Request Media ---

export function requestMovie(
  tmdbId: number,
  options?: OverseerrRequestOptions,
): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", "/request", {
    method: "POST",
    body: JSON.stringify({
      mediaType: "movie",
      mediaId: tmdbId,
      ...options,
    }),
  });
}

// Seerr requires `seasons` for TV requests; "all" resolves server-side to every
// non-special season.
export function requestTV(
  tmdbId: number,
  seasons: number[] | "all" = "all",
  options?: OverseerrRequestOptions,
): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", "/request", {
    method: "POST",
    body: JSON.stringify({
      mediaType: "tv",
      mediaId: tmdbId,
      seasons,
      ...options,
    }),
  });
}

// --- Approve / Decline ---

export function approveRequest(requestId: number): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", `/request/${requestId}/approve`, {
    method: "POST",
  });
}

export function declineRequest(requestId: number): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", `/request/${requestId}/decline`, {
    method: "POST",
  });
}

// --- Media Details ---

export function getMovieDetails(tmdbId: number): Promise<OverseerrMovieDetails> {
  return serviceRequest<OverseerrMovieDetails>("overseerr", `/movie/${tmdbId}`);
}

export function getTVDetails(tmdbId: number): Promise<OverseerrTVDetails> {
  return serviceRequest<OverseerrTVDetails>("overseerr", `/tv/${tmdbId}`);
}

// --- Delete Media (resets Overseerr status so it can be re-requested) ---

export function deleteMedia(mediaId: number): Promise<void> {
  return serviceRequest<void>("overseerr", `/media/${mediaId}`, {
    method: "DELETE",
  });
}

// --- Service discovery (Radarr/Sonarr instances configured in Seerr) ---

export function getOverseerrRadarrServers(): Promise<OverseerrServerInfo[]> {
  return serviceRequest<OverseerrServerInfo[]>("overseerr", "/service/radarr");
}

export function getOverseerrSonarrServers(): Promise<OverseerrServerInfo[]> {
  return serviceRequest<OverseerrServerInfo[]>("overseerr", "/service/sonarr");
}

export function getOverseerrRadarrServerDetails(
  id: number,
): Promise<OverseerrServerDetails> {
  return serviceRequest<OverseerrServerDetails>("overseerr", `/service/radarr/${id}`);
}

export function getOverseerrSonarrServerDetails(
  id: number,
): Promise<OverseerrServerDetails> {
  return serviceRequest<OverseerrServerDetails>("overseerr", `/service/sonarr/${id}`);
}

// --- Helpers ---

export function getPosterUrl(posterPath: string | undefined | null, size: "w185" | "w342" | "w500" = "w342"): string | null {
  if (!posterPath) return null;
  return `${TMDB_IMAGE_BASE}/${size}${posterPath}`;
}

export function getBackdropUrl(backdropPath: string | undefined | null): string | null {
  if (!backdropPath) return null;
  return `${TMDB_IMAGE_BASE}/w780${backdropPath}`;
}

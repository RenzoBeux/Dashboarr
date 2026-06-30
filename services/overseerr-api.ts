import { serviceRequest } from "@/lib/http-client";
import type {
  OverseerrMediaType,
  OverseerrRequestsResponse,
  OverseerrSearchResponse,
  OverseerrGenreSliderItem,
  OverseerrRequest,
  OverseerrRequestCount,
  OverseerrTrendingResult,
  OverseerrMovieDetails,
  OverseerrTVDetails,
  OverseerrServerInfo,
  OverseerrServerDetails,
  OverseerrRelatedVideo,
  DiscoverSlider,
  DiscoverSliderInput,
  DiscoverSliderCreate,
} from "@/lib/types";

export interface OverseerrRequestOptions {
  serverId?: number;
  profileId?: number;
  rootFolder?: string;
  tags?: number[];
  // When true, the request targets the 4K Radarr/Sonarr server. Seerr resolves
  // the default 4K server when serverId is omitted.
  is4k?: boolean;
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// Per-instance routing: every function takes an optional `instanceId` that
// scopes the request to a specific Seerr instance. When omitted, the user's
// active Seerr is used (legacy single-instance behavior).

// --- Requests ---

// Overseerr's OpenAPI schema rejects unknown query params via
// express-openapi-validator. `sortDirection` isn't declared, so sending it
// 500s the request — the server only ever sorts DESC.
export function getRequests(
  page = 1,
  pageSize = 20,
  filter?: "all" | "approved" | "pending" | "processing" | "available",
  sort: "added" | "modified" = "added",
  instanceId?: string,
): Promise<OverseerrRequestsResponse> {
  return serviceRequest<OverseerrRequestsResponse>("overseerr", "/request", {
    params: {
      take: pageSize,
      skip: (page - 1) * pageSize,
      sort,
      ...(filter && filter !== "all" ? { filter } : {}),
    },
    instanceId,
  });
}

export function getRequestCount(instanceId?: string): Promise<OverseerrRequestCount> {
  return serviceRequest<OverseerrRequestCount>("overseerr", "/request/count", {
    instanceId,
  });
}

// --- Search ---

export function searchMedia(
  query: string,
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/search", {
    params: { query, page },
    instanceId,
  });
}

// --- Trending / Discover ---

export function getTrending(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/trending", {
    params: { page },
    instanceId,
  });
}

export function getPopularMovies(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/movies", {
    params: { page },
    instanceId,
  });
}

export function getPopularTV(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/tv", {
    params: { page },
    instanceId,
  });
}

export function getUpcomingMovies(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/movies/upcoming", {
    params: { page },
    instanceId,
  });
}

export function getRecentlyAdded(
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/recently-added", {
    instanceId,
  });
}

// --- Browse by network / studio / genre ---
// Path-param discover endpoints. Only `page` is sent — Overseerr's
// express-openapi-validator 500s on undeclared query params, so `language` is
// intentionally omitted. Responses carry an extra network/studio/genre object
// alongside `results`, which we ignore (OverseerrSearchResponse reads results).

export function getNetworkContent(
  networkId: number,
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", `/discover/tv/network/${networkId}`, {
    params: { page },
    instanceId,
  });
}

export function getStudioContent(
  studioId: number,
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", `/discover/movies/studio/${studioId}`, {
    params: { page },
    instanceId,
  });
}

// Genre ids differ between movie and tv, so the caller picks the media type
// (which also selects the endpoint).
export function getGenreContent(
  mediaType: OverseerrMediaType,
  genreId: number,
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  const path =
    mediaType === "movie"
      ? `/discover/movies/genre/${genreId}`
      : `/discover/tv/genre/${genreId}`;
  return serviceRequest<OverseerrSearchResponse>("overseerr", path, {
    params: { page },
    instanceId,
  });
}

export function getGenreSlider(
  mediaType: OverseerrMediaType,
  instanceId?: string,
): Promise<OverseerrGenreSliderItem[]> {
  return serviceRequest<OverseerrGenreSliderItem[]>("overseerr", `/discover/genreslider/${mediaType}`, {
    instanceId,
  });
}

export function getUpcomingTv(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return serviceRequest<OverseerrSearchResponse>("overseerr", "/discover/tv/upcoming", {
    params: { page },
    instanceId,
  });
}

// Generic /discover/{movies,tv} query, used to render custom keyword/streaming
// sliders. Genre/studio/network customs reuse the dedicated path-param helpers
// above. CAUTION: Overseerr's express-openapi-validator 500s on undeclared
// query params, so we strip undefined and only send declared ones (verified
// against the spec: genre, keywords, studio, network, watchProviders,
// watchRegion, page).
export interface DiscoverQueryParams {
  page?: number;
  keywords?: number | string;
  watchProviders?: string;
  watchRegion?: string;
}

export function getDiscover(
  mediaType: OverseerrMediaType,
  params: DiscoverQueryParams,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  const path = mediaType === "movie" ? "/discover/movies" : "/discover/tv";
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") clean[key] = value;
  }
  return serviceRequest<OverseerrSearchResponse>("overseerr", path, {
    params: clean,
    instanceId,
  });
}

// --- Discover customization (settings/discover sliders) ---
// These hit Seerr's discover-settings API and require an admin API key. The
// app's configured Seerr key is normally an admin key; a non-admin key 403s on
// GET, which the Discover tab handles by falling back to its built-in layout.

export function getDiscoverSliders(instanceId?: string): Promise<DiscoverSlider[]> {
  return serviceRequest<DiscoverSlider[]>("overseerr", "/settings/discover", {
    instanceId,
  });
}

// Bulk reorder/enable/rename. The server sets each slider's `order` from its
// array index, so send the array already in the desired display order.
export function saveDiscoverSliders(
  sliders: DiscoverSliderInput[],
  instanceId?: string,
): Promise<DiscoverSlider[]> {
  return serviceRequest<DiscoverSlider[]>("overseerr", "/settings/discover", {
    method: "POST",
    body: JSON.stringify(sliders),
    instanceId,
  });
}

export function addDiscoverSlider(
  body: DiscoverSliderCreate,
  instanceId?: string,
): Promise<DiscoverSlider> {
  return serviceRequest<DiscoverSlider>("overseerr", "/settings/discover/add", {
    method: "POST",
    body: JSON.stringify(body),
    instanceId,
  });
}

export function updateDiscoverSlider(
  sliderId: number,
  body: DiscoverSliderCreate,
  instanceId?: string,
): Promise<DiscoverSlider> {
  return serviceRequest<DiscoverSlider>("overseerr", `/settings/discover/${sliderId}`, {
    method: "PUT",
    body: JSON.stringify(body),
    instanceId,
  });
}

export function deleteDiscoverSlider(
  sliderId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("overseerr", `/settings/discover/${sliderId}`, {
    method: "DELETE",
    instanceId,
  });
}

// Resets all sliders to the built-in defaults. GET per Overseerr's route
// definition; returns 204 (empty body).
export function resetDiscoverSliders(instanceId?: string): Promise<void> {
  return serviceRequest<void>("overseerr", "/settings/discover/reset", {
    instanceId,
  });
}

// --- Request Media ---

export function requestMovie(
  tmdbId: number,
  options?: OverseerrRequestOptions,
  instanceId?: string,
): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", "/request", {
    method: "POST",
    body: JSON.stringify({
      mediaType: "movie",
      mediaId: tmdbId,
      ...options,
    }),
    instanceId,
  });
}

// Seerr requires `seasons` for TV requests; "all" resolves server-side to every
// non-special season.
export function requestTV(
  tmdbId: number,
  seasons: number[] | "all" = "all",
  options?: OverseerrRequestOptions,
  instanceId?: string,
): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", "/request", {
    method: "POST",
    body: JSON.stringify({
      mediaType: "tv",
      mediaId: tmdbId,
      seasons,
      ...options,
    }),
    instanceId,
  });
}

// --- Approve / Decline ---

export function approveRequest(
  requestId: number,
  instanceId?: string,
): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", `/request/${requestId}/approve`, {
    method: "POST",
    instanceId,
  });
}

export function declineRequest(
  requestId: number,
  instanceId?: string,
): Promise<OverseerrRequest> {
  return serviceRequest<OverseerrRequest>("overseerr", `/request/${requestId}/decline`, {
    method: "POST",
    instanceId,
  });
}

// Removes just the request record. With MANAGE_REQUESTS any request can be
// deleted; otherwise only pending ones. Leaves the underlying media untouched —
// use deleteMedia() to untrack the media itself.
export function deleteRequest(
  requestId: number,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("overseerr", `/request/${requestId}`, {
    method: "DELETE",
    instanceId,
  });
}

// --- Media Details ---

export function getMovieDetails(
  tmdbId: number,
  instanceId?: string,
): Promise<OverseerrMovieDetails> {
  return serviceRequest<OverseerrMovieDetails>("overseerr", `/movie/${tmdbId}`, {
    instanceId,
  });
}

export function getTVDetails(
  tmdbId: number,
  instanceId?: string,
): Promise<OverseerrTVDetails> {
  return serviceRequest<OverseerrTVDetails>("overseerr", `/tv/${tmdbId}`, {
    instanceId,
  });
}

// --- Delete Media (resets Overseerr status so it can be re-requested) ---

export function deleteMedia(mediaId: number, instanceId?: string): Promise<void> {
  return serviceRequest<void>("overseerr", `/media/${mediaId}`, {
    method: "DELETE",
    instanceId,
  });
}

// --- Service discovery (Radarr/Sonarr instances configured in Seerr) ---

export function getOverseerrRadarrServers(
  instanceId?: string,
): Promise<OverseerrServerInfo[]> {
  return serviceRequest<OverseerrServerInfo[]>("overseerr", "/service/radarr", {
    instanceId,
  });
}

export function getOverseerrSonarrServers(
  instanceId?: string,
): Promise<OverseerrServerInfo[]> {
  return serviceRequest<OverseerrServerInfo[]>("overseerr", "/service/sonarr", {
    instanceId,
  });
}

export function getOverseerrRadarrServerDetails(
  id: number,
  instanceId?: string,
): Promise<OverseerrServerDetails> {
  return serviceRequest<OverseerrServerDetails>("overseerr", `/service/radarr/${id}`, {
    instanceId,
  });
}

export function getOverseerrSonarrServerDetails(
  id: number,
  instanceId?: string,
): Promise<OverseerrServerDetails> {
  return serviceRequest<OverseerrServerDetails>("overseerr", `/service/sonarr/${id}`, {
    instanceId,
  });
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

// Pick the best playable trailer from a title's related videos. We can only
// embed YouTube, and prefer an official trailer, then teaser, then any clip.
const TRAILER_TYPE_PRIORITY: OverseerrRelatedVideo["type"][] = [
  "Trailer",
  "Teaser",
  "Clip",
  "Featurette",
  "Behind the Scenes",
];

export function pickTrailer(
  videos: OverseerrRelatedVideo[] | undefined | null,
): OverseerrRelatedVideo | null {
  const youtube = (videos ?? []).filter(
    (v) => v.site === "YouTube" && !!v.key,
  );
  if (youtube.length === 0) return null;
  for (const type of TRAILER_TYPE_PRIORITY) {
    const match = youtube.find((v) => v.type === type);
    if (match) return match;
  }
  return youtube[0];
}

import {
  AuthProxyResponseError,
  HttpError,
  ensureSeerrSession,
  seerrFetchMe,
  seerrLogout,
  serviceRequest,
} from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import {
  isSeerrSessionRejection,
  readSeerrMe,
  seerrAuthMode,
  seerrUsesSession,
  type SeerrMe,
} from "@/lib/seerr-auth";
import {
  dropSeerrSession,
  forgetSeerrSession,
  invalidateSeerrSession,
  isSeerrSessionEstablished,
  seerrSessionGeneration,
  seerrSessionIds,
  setSeerrSession,
} from "@/lib/seerr-session";
import type {
  OverseerrMediaType,
  OverseerrMediaListResponse,
  OverseerrMediaResult,
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
  OverseerrUsersResponse,
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
  // File the request on behalf of another Seerr account (#332). `requestedBy`
  // becomes that user; permitted because the API key authenticates as the admin,
  // who holds MANAGE_USERS/MANAGE_REQUESTS. This is the same field Seerr's own
  // "Request As" dropdown sends, and it is declared in both forks' schemas.
  //
  // Note the split: `requestedBy` and the quota check follow this user, but the
  // approval decision is taken from the CALLER. Since `hasPermission` returns
  // true outright for ADMIN, an admin API key always yields an APPROVED
  // request, whatever the target account's own permissions say — this cannot
  // be used to route requests into someone's pending queue.
  userId?: number;
}

type SeerrRequestOptions = NonNullable<Parameters<typeof serviceRequest>[2]>;

/**
 * Every Seerr call goes through here instead of serviceRequest directly (#332).
 *
 * In API-key mode (and demo mode) this IS serviceRequest. In a sign-in mode it
 * establishes the session first, then retries exactly once when Seerr rejects
 * the request as unauthenticated. The shape is services/navidrome-api.ts's
 * `native()` wrapper with one extra step: Seerr answers 403 both for "no
 * session" and for "no permission", so before re-logging in it asks
 * GET /auth/me whether the session is still alive. A live session means the
 * 403 was a permission denial, which is rethrown as-is (the UI gates those
 * calls on the account's permissions anyway) instead of churning a fresh
 * server-side session for nothing.
 */
function seerrRequest<T>(path: string, options: SeerrRequestOptions = {}): Promise<T> {
  const store = useConfigStore.getState();
  const id = options.instanceId ?? store.getActiveInstanceId("overseerr");
  const inst = id ? store.getInstance("overseerr", id) : undefined;
  if (!id || !inst || store.demoMode || !seerrUsesSession(seerrAuthMode(inst))) {
    return serviceRequest<T>("overseerr", path, options);
  }
  return sessionRequest<T>(id, path, options);
}

async function sessionRequest<T>(
  id: string,
  path: string,
  options: SeerrRequestOptions,
): Promise<T> {
  const call = async (): Promise<T> => {
    await ensureSeerrSession(id);
    return serviceRequest<T>("overseerr", path, { ...options, instanceId: id });
  };
  // Captured before the first attempt: if the session dies underneath us,
  // exactly one caller's generation matches and triggers the re-login.
  const generation = seerrSessionGeneration(id);
  try {
    return await call();
  } catch (err) {
    if (
      !(err instanceof HttpError) ||
      err instanceof AuthProxyResponseError ||
      !isSeerrSessionRejection(err.status)
    ) {
      throw err;
    }
    const store = useConfigStore.getState();
    const baseUrl = store.getActiveUrl("overseerr", id);
    const live = baseUrl
      ? await seerrFetchMe(baseUrl, store.getMergedHeaders("overseerr", id)).catch(() => null)
      : null;
    if (live) {
      setSeerrSession(id, live);
      throw err;
    }
    invalidateSeerrSession(id, generation);
    return call();
  }
}

/**
 * The account this instance acts as. In a sign-in mode that is the signed-in
 * user; in API-key mode it is whoever the key belongs to (the admin). Either
 * way the payload's `permissions` bitfield is what lib/seerr-permissions.ts
 * turns into UI capabilities.
 */
export async function getSeerrMe(instanceId?: string): Promise<SeerrMe> {
  const store = useConfigStore.getState();
  const id = instanceId ?? store.getActiveInstanceId("overseerr");
  if (!id) throw new Error("Service overseerr has no configured instance");
  const inst = store.getInstance("overseerr", id);
  if (!store.demoMode && inst && seerrUsesSession(seerrAuthMode(inst))) {
    return ensureSeerrSession(id);
  }
  const me = readSeerrMe(await seerrRequest<unknown>("/auth/me", { instanceId: id }));
  if (!me) throw new Error("Unrecognized /auth/me response from Seerr");
  if (!store.demoMode) setSeerrSession(id, me);
  return me;
}

/**
 * Log the instance's session out (best effort) and forget it, so the next
 * request signs in again with whatever credentials are stored by then. Called
 * before a credential save and before instance removal, the piholeClearSession
 * precedent: it resolves the host from the store at call time, so it has to
 * run BEFORE updateInstance rewrites the URL.
 */
export async function seerrClearSession(instanceId?: string): Promise<void> {
  const store = useConfigStore.getState();
  const ids = instanceId ? [instanceId] : seerrSessionIds();
  for (const id of ids) {
    if (!store.demoMode && isSeerrSessionEstablished(id)) {
      const inst = store.getInstance("overseerr", id);
      const baseUrl = store.getActiveUrl("overseerr", id);
      if (inst && baseUrl && seerrUsesSession(seerrAuthMode(inst))) {
        await seerrLogout(baseUrl, store.getMergedHeaders("overseerr", id));
      }
    }
    dropSeerrSession(id);
    forgetSeerrSession(id);
  }
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
  return seerrRequest<OverseerrRequestsResponse>("/request", {
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
  return seerrRequest<OverseerrRequestCount>("/request/count", {
    instanceId,
  });
}

// --- Search ---

export function searchMedia(
  query: string,
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return seerrRequest<OverseerrSearchResponse>("/search", {
    params: { query, page },
    instanceId,
  });
}

// --- Trending / Discover ---

export function getTrending(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return seerrRequest<OverseerrSearchResponse>("/discover/trending", {
    params: { page },
    instanceId,
  });
}

export function getPopularMovies(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return seerrRequest<OverseerrSearchResponse>("/discover/movies", {
    params: { page },
    instanceId,
  });
}

export function getPopularTV(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return seerrRequest<OverseerrSearchResponse>("/discover/tv", {
    params: { page },
    instanceId,
  });
}

export function getUpcomingMovies(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return seerrRequest<OverseerrSearchResponse>("/discover/movies/upcoming", {
    params: { page },
    instanceId,
  });
}

// Seerr has no /discover/recently-added endpoint (verified against both the
// Overseerr and Jellyseerr route sources) — the web UI's Recently Added slider
// reads GET /media sorted by mediaAddedAt and hydrates each bare Media entity
// (ids + status only) from the movie/tv details endpoints. We do the same and
// shape the result as a search response so the row renders like any other
// slider. Entries whose details fetch fails are dropped rather than failing
// the whole row.
export async function getRecentlyAdded(
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  const media = await seerrRequest<OverseerrMediaListResponse>("/media", {
    params: { filter: "allavailable", take: 20, sort: "mediaAdded" },
    instanceId,
  });
  const hydrated = await Promise.allSettled(
    (media.results ?? []).map(async (entity): Promise<OverseerrMediaResult> => {
      if (entity.mediaType === "movie") {
        const d = await getMovieDetails(entity.tmdbId, instanceId);
        return {
          id: d.id,
          mediaType: "movie",
          title: d.title,
          overview: d.overview ?? "",
          posterPath: d.posterPath,
          backdropPath: d.backdropPath,
          releaseDate: d.releaseDate,
          voteAverage: d.voteAverage ?? 0,
          mediaInfo: d.mediaInfo ?? { status: entity.status, status4k: entity.status4k },
        };
      }
      const d = await getTVDetails(entity.tmdbId, instanceId);
      return {
        id: d.id,
        mediaType: "tv",
        name: d.name,
        overview: d.overview ?? "",
        posterPath: d.posterPath,
        backdropPath: d.backdropPath,
        firstAirDate: d.firstAirDate,
        voteAverage: d.voteAverage ?? 0,
        mediaInfo: d.mediaInfo ?? { status: entity.status, status4k: entity.status4k },
      };
    }),
  );
  const results = hydrated
    .filter(
      (r): r is PromiseFulfilledResult<OverseerrMediaResult> => r.status === "fulfilled",
    )
    .map((r) => r.value);
  return {
    page: 1,
    totalPages: 1,
    totalResults: results.length,
    results,
  };
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
  return seerrRequest<OverseerrSearchResponse>(`/discover/tv/network/${networkId}`, {
    params: { page },
    instanceId,
  });
}

export function getStudioContent(
  studioId: number,
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return seerrRequest<OverseerrSearchResponse>(`/discover/movies/studio/${studioId}`, {
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
  return seerrRequest<OverseerrSearchResponse>(path, {
    params: { page },
    instanceId,
  });
}

export function getGenreSlider(
  mediaType: OverseerrMediaType,
  instanceId?: string,
): Promise<OverseerrGenreSliderItem[]> {
  return seerrRequest<OverseerrGenreSliderItem[]>(`/discover/genreslider/${mediaType}`, {
    instanceId,
  });
}

export function getUpcomingTv(
  page = 1,
  instanceId?: string,
): Promise<OverseerrSearchResponse> {
  return seerrRequest<OverseerrSearchResponse>("/discover/tv/upcoming", {
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
  return seerrRequest<OverseerrSearchResponse>(path, {
    params: clean,
    instanceId,
  });
}

// --- Discover customization (settings/discover sliders) ---
// These hit Seerr's discover-settings API and require an admin API key. The
// app's configured Seerr key is normally an admin key; a non-admin key 403s on
// GET, which the Discover tab handles by falling back to its built-in layout.

export function getDiscoverSliders(instanceId?: string): Promise<DiscoverSlider[]> {
  return seerrRequest<DiscoverSlider[]>("/settings/discover", {
    instanceId,
  });
}

// Bulk reorder/enable/rename. The server sets each slider's `order` from its
// array index, so send the array already in the desired display order.
export function saveDiscoverSliders(
  sliders: DiscoverSliderInput[],
  instanceId?: string,
): Promise<DiscoverSlider[]> {
  return seerrRequest<DiscoverSlider[]>("/settings/discover", {
    method: "POST",
    body: JSON.stringify(sliders),
    instanceId,
  });
}

export function addDiscoverSlider(
  body: DiscoverSliderCreate,
  instanceId?: string,
): Promise<DiscoverSlider> {
  return seerrRequest<DiscoverSlider>("/settings/discover/add", {
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
  return seerrRequest<DiscoverSlider>(`/settings/discover/${sliderId}`, {
    method: "PUT",
    body: JSON.stringify(body),
    instanceId,
  });
}

export function deleteDiscoverSlider(
  sliderId: number,
  instanceId?: string,
): Promise<void> {
  return seerrRequest<void>(`/settings/discover/${sliderId}`, {
    method: "DELETE",
    instanceId,
  });
}

// Resets all sliders to the built-in defaults. GET per Overseerr's route
// definition; returns 204 (empty body).
export function resetDiscoverSliders(instanceId?: string): Promise<void> {
  return seerrRequest<void>("/settings/discover/reset", {
    instanceId,
  });
}

// --- Request Media ---

export function requestMovie(
  tmdbId: number,
  options?: OverseerrRequestOptions,
  instanceId?: string,
): Promise<OverseerrRequest> {
  return seerrRequest<OverseerrRequest>("/request", {
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
  return seerrRequest<OverseerrRequest>("/request", {
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
  return seerrRequest<OverseerrRequest>(`/request/${requestId}/approve`, {
    method: "POST",
    instanceId,
  });
}

export function declineRequest(
  requestId: number,
  instanceId?: string,
): Promise<OverseerrRequest> {
  return seerrRequest<OverseerrRequest>(`/request/${requestId}/decline`, {
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
  return seerrRequest<void>(`/request/${requestId}`, {
    method: "DELETE",
    instanceId,
  });
}

// --- Users ---

// The accounts on this Seerr, used by the "Request As" picker (#332).
//
// Only `take`, `skip` and `sort` may be sent. Seerr also accepts
// `sortDirection`, `q` and `includeIds`, but Overseerr's schema declares none
// of them, and express-openapi-validator rejects undeclared QUERY params with a
// 500 (the same trap as `sortDirection` on /request above) — so the request has
// to stay inside the intersection of both forks. `displayname` is in both
// enums. Body properties are not affected: those schemas set no
// `additionalProperties: false`, which is why the `tags` we send on /request is
// accepted despite being undeclared.
//
// `take` is NOT optional in practice: omitted, the server defaults the page
// size to 10, so a household with more accounts than that would silently lose
// the rest.
export function getOverseerrUsers(
  take = 100,
  instanceId?: string,
): Promise<OverseerrUsersResponse> {
  return seerrRequest<OverseerrUsersResponse>("/user", {
    params: { take, skip: 0, sort: "displayname" },
    instanceId,
  });
}

// --- Media Details ---

export function getMovieDetails(
  tmdbId: number,
  instanceId?: string,
): Promise<OverseerrMovieDetails> {
  return seerrRequest<OverseerrMovieDetails>(`/movie/${tmdbId}`, {
    instanceId,
  });
}

export function getTVDetails(
  tmdbId: number,
  instanceId?: string,
): Promise<OverseerrTVDetails> {
  return seerrRequest<OverseerrTVDetails>(`/tv/${tmdbId}`, {
    instanceId,
  });
}

// --- Delete Media (resets Overseerr status so it can be re-requested) ---

export function deleteMedia(mediaId: number, instanceId?: string): Promise<void> {
  return seerrRequest<void>(`/media/${mediaId}`, {
    method: "DELETE",
    instanceId,
  });
}

// --- Service discovery (Radarr/Sonarr instances configured in Seerr) ---

export function getOverseerrRadarrServers(
  instanceId?: string,
): Promise<OverseerrServerInfo[]> {
  return seerrRequest<OverseerrServerInfo[]>("/service/radarr", {
    instanceId,
  });
}

export function getOverseerrSonarrServers(
  instanceId?: string,
): Promise<OverseerrServerInfo[]> {
  return seerrRequest<OverseerrServerInfo[]>("/service/sonarr", {
    instanceId,
  });
}

export function getOverseerrRadarrServerDetails(
  id: number,
  instanceId?: string,
): Promise<OverseerrServerDetails> {
  return seerrRequest<OverseerrServerDetails>(`/service/radarr/${id}`, {
    instanceId,
  });
}

export function getOverseerrSonarrServerDetails(
  id: number,
  instanceId?: string,
): Promise<OverseerrServerDetails> {
  return seerrRequest<OverseerrServerDetails>(`/service/sonarr/${id}`, {
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

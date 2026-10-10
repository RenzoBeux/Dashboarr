import { HttpError, serviceRequest } from "@/lib/http-client";
import {
  BAZARR_MANUAL_SEARCH_TIMEOUT,
  INTERACTIVE_SEARCH_TIMEOUT,
} from "@/lib/constants";
import {
  deleteParams,
  downloadResultParams,
  providersRoute,
  searchParams,
  subtitlesRoute,
  targetParams,
  toolParams,
  uploadFields,
  type LanguageChoice,
  type ProviderResultRef,
  type SubtitleTarget,
  type SubtitleToolAction,
} from "@/lib/bazarr-subtitle-tools";
import {
  formatArrAddress,
  matchArrInstance,
  type ArrCandidate,
  type ArrKind,
  type BazarrArrSide,
} from "@/lib/bazarr-link";
import type {
  BazarrEpisode,
  BazarrHistoryResponse,
  BazarrJob,
  BazarrLanguageProfile,
  BazarrListResponse,
  BazarrMissingSubtitle,
  BazarrMovie,
  BazarrProvider,
  BazarrSeries,
  BazarrSubtitle,
  BazarrSubtitleResult,
  BazarrSystemStatus,
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

// --- System ---

export async function getBazarrStatus(instanceId?: string): Promise<BazarrSystemStatus> {
  const res = await serviceRequest<{ data: BazarrSystemStatus }>("bazarr", "/system/status", {
    instanceId,
  });
  return res.data;
}

/**
 * Ids of the background jobs still pending or running, or null when this
 * Bazarr has no job queue (before 1.5.6 the route 404s and actions block until
 * done instead).
 */
export async function getActiveBazarrJobIds(instanceId?: string): Promise<number[] | null> {
  try {
    const lists = await Promise.all(
      (["pending", "running"] as const).map((status) =>
        serviceRequest<{ data: BazarrJob[] }>("bazarr", "/system/jobs", {
          params: { status },
          instanceId,
        }),
      ),
    );
    return lists.flatMap((l) => (l?.data ?? []).map((j) => j.job_id));
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 405)) return null;
    throw err;
  }
}

export function getBazarrLanguageProfiles(instanceId?: string): Promise<BazarrLanguageProfile[]> {
  return serviceRequest<BazarrLanguageProfile[]>("bazarr", "/system/languages/profiles", {
    instanceId,
  });
}

// --- Items ---

/** Bazarr's view of one Radarr movie, or null when Bazarr doesn't know it. */
export async function getBazarrMovie(
  radarrId: number,
  instanceId?: string,
): Promise<BazarrMovie | null> {
  const res = await serviceRequest<BazarrListResponse<BazarrMovie>>("bazarr", "/movies", {
    params: { "radarrid[]": radarrId },
    instanceId,
  });
  return res.data[0] ?? null;
}

/** Bazarr's view of one Sonarr series, or null when Bazarr doesn't know it. */
export async function getBazarrSeriesItem(
  seriesId: number,
  instanceId?: string,
): Promise<BazarrSeries | null> {
  const res = await serviceRequest<BazarrListResponse<BazarrSeries>>("bazarr", "/series", {
    params: { "seriesid[]": seriesId },
    instanceId,
  });
  return res.data[0] ?? null;
}

/** Every episode of a series, newest season first. */
export async function getBazarrSeriesEpisodes(
  seriesId: number,
  instanceId?: string,
): Promise<BazarrEpisode[]> {
  const res = await serviceRequest<BazarrListResponse<BazarrEpisode>>("bazarr", "/episodes", {
    params: { "seriesid[]": seriesId },
    instanceId,
  });
  return res.data;
}

// --- Subtitle actions ---
//
// Since Bazarr 1.5.6 these return 204 at once and run as background jobs; the
// caller refreshes through lib/job-watch.ts. Before 1.5.6 they block until the
// work is done, hence the long timeouts.

/** Search one language automatically. */
export function searchSubtitle(
  target: SubtitleTarget,
  lang: LanguageChoice,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bazarr", subtitlesRoute(target), {
    method: "PATCH",
    params: searchParams(target, lang),
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

/** Search every missing language of one movie or one series. */
export function searchMissingSubtitles(
  target: { type: "movie"; radarrId: number } | { type: "series"; seriesId: number },
  instanceId?: string,
): Promise<void> {
  return target.type === "movie"
    ? searchWantedMovie(target.radarrId, instanceId)
    : serviceRequest<void>("bazarr", "/series", {
        method: "PATCH",
        body: JSON.stringify({ seriesid: target.seriesId, action: "search-missing" }),
        timeout: INTERACTIVE_SEARCH_TIMEOUT,
        instanceId,
      });
}

export interface PickedSubtitleFile {
  uri: string;
  name: string;
  mimeType?: string | null;
}

/** Upload a subtitle file for one language. */
export function uploadSubtitle(
  target: SubtitleTarget,
  file: PickedSubtitleFile,
  lang: LanguageChoice,
  instanceId?: string,
): Promise<void> {
  // serviceRequest keeps fetch's own multipart Content-Type for FormData.
  const form = new FormData();
  for (const [key, value] of Object.entries(uploadFields(target, lang))) {
    form.append(key, String(value));
  }
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  } as unknown as Blob);
  return serviceRequest<void>("bazarr", subtitlesRoute(target), {
    method: "POST",
    body: form,
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

/** Delete an external subtitle file. */
export function deleteSubtitle(
  target: SubtitleTarget,
  sub: BazarrSubtitle,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bazarr", subtitlesRoute(target), {
    method: "DELETE",
    params: deleteParams(target, sub),
    instanceId,
  });
}

/**
 * Manual search: every enabled provider's candidates for every language in
 * the item's profile (there is no language filter). Slow and synchronous, so
 * it takes the query's abort signal and a long timeout.
 */
export async function manualSearchSubtitles(
  target: SubtitleTarget,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<BazarrSubtitleResult[]> {
  const res = await serviceRequest<BazarrListResponse<BazarrSubtitleResult>>(
    "bazarr",
    providersRoute(target),
    {
      params: targetParams(target),
      timeout: BAZARR_MANUAL_SEARCH_TIMEOUT,
      signal,
      instanceId,
    },
  );
  return res.data ?? [];
}

/** Download one manual-search result. */
export function downloadSubtitleResult(
  target: SubtitleTarget,
  result: ProviderResultRef,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bazarr", providersRoute(target), {
    method: "POST",
    params: downloadResultParams(target, result),
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

/** Sync, translate, extract or clean up one subtitle. */
export function runSubtitleTool(
  target: SubtitleTarget,
  sub: BazarrSubtitle,
  action: SubtitleToolAction,
  instanceId?: string,
): Promise<void> {
  return serviceRequest<void>("bazarr", "/subtitles", {
    method: "PATCH",
    params: toolParams(target, sub, action),
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
  });
}

/**
 * Change the language profile of a movie or series; null removes it. Bazarr
 * only reads "" (or null/undefined) as "none" — "none" itself 404s.
 */
export function setLanguageProfile(
  target: { type: "movie"; radarrId: number } | { type: "series"; seriesId: number },
  profileId: number | null,
  instanceId?: string,
): Promise<void> {
  const idParam: Record<string, number> =
    target.type === "movie" ? { radarrid: target.radarrId } : { seriesid: target.seriesId };
  return serviceRequest<void>("bazarr", target.type === "movie" ? "/movies" : "/series", {
    method: "POST",
    params: { ...idParam, profileid: profileId === null ? "" : profileId },
    instanceId,
  });
}

// --- Radarr/Sonarr link detection ---

export interface ArrLinkSideResult {
  // The matched app instance, or null.
  instanceId: string | null;
  // Where Bazarr says it reaches that arr ("radarr:7878"), for display.
  address: string | null;
}

export interface ArrLinkDetection {
  radarr: ArrLinkSideResult;
  sonarr: ArrLinkSideResult;
}

/**
 * Which of the given Radarr/Sonarr instances this Bazarr is configured
 * against (see lib/bazarr-link.ts for the model).
 *
 * `/system/settings` is the only place Bazarr exposes that, and it returns the
 * WHOLE configuration — every subtitle-provider password included. So the
 * response never leaves this function: the match is computed here and only
 * instance ids and display addresses are returned, which keeps the secrets out
 * of the React Query cache, devtools and any error report.
 */
export async function detectArrLinks(
  candidates: { radarr: readonly ArrCandidate[]; sonarr: readonly ArrCandidate[] },
  instanceId?: string,
): Promise<ArrLinkDetection> {
  const settings = await serviceRequest<unknown>("bazarr", "/system/settings", {
    instanceId,
  });
  const result = (kind: ArrKind): ArrLinkSideResult => {
    const side = readArrSide(settings, kind);
    return {
      instanceId: matchArrInstance(side, candidates[kind]),
      address: formatArrAddress(side),
    };
  };
  return { radarr: result("radarr"), sonarr: result("sonarr") };
}

// Bazarr settings: general.use_radarr / use_sonarr toggle each integration;
// radarr.{ip, port, apikey} and sonarr.{…} hold the connection.
function readArrSide(settings: unknown, kind: ArrKind): BazarrArrSide {
  const root = isRecord(settings) ? settings : {};
  const general = isRecord(root.general) ? root.general : {};
  const conn = isRecord(root[kind]) ? root[kind] : {};
  return {
    enabled: general[`use_${kind}`] === true,
    apiKey: typeof conn.apikey === "string" ? conn.apikey : undefined,
    host: typeof conn.ip === "string" ? conn.ip : undefined,
    port: typeof conn.port === "number" ? conn.port : undefined,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

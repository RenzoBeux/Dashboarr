import { serviceRequest } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import { readHydraJsonError, readHydraXmlError } from "@/lib/nzbhydra2-normalize";
import type {
  Nzbhydra2Caps,
  Nzbhydra2DownloadHistoryRow,
  Nzbhydra2HistoryPage,
  Nzbhydra2HistoryRequest,
  Nzbhydra2IndexerStatus,
  Nzbhydra2SearchItem,
  Nzbhydra2SearchResponse,
  Nzbhydra2SearchHistoryRow,
  Nzbhydra2StatsRequest,
  Nzbhydra2StatsResponse,
} from "@/lib/types";

// NZBHydra2 API notes:
//   - Auth is ONE install-wide API key. It travels as ?apikey= in the query
//     string (injected for every nzbhydra2 request by lib/http-client.ts, the
//     Jackett/SABnzbd pattern) AND inside the JSON body of the four POST
//     endpoints below. Since v7.15.3 (2025-07-04) those four bind @RequestBody,
//     so the body is mandatory and query params are ignored; before that they
//     bound from query params. Sending the key BOTH ways costs nothing and
//     keeps pre-7.15.3 installs working. (The wiki still documents only the old
//     query-param/dot-notation form — it is stale.)
//   - apiBasePath is "" (the anonymous ping /actuator/health/ping is
//     root-mounted, outside /api), so every path here carries its own /api
//     prefix — the Cleanuparr / JellyStat pattern.
//   - EVERY /api error is HTTP 200. ExternalApi's @ExceptionHandler returns a
//     NewznabXmlError whose default status is 200, so serviceRequest never
//     throws for a wrong key or a malformed query — the body is the only
//     signal. parseSearchResponse below is what turns it back into an error.
//   - /api/stats, /api/stats/indexers and /api/history/* are ADDITIONALLY gated
//     by NZBHydra2's own auth.allowApiStats flag (default on). With it off all
//     four reject a valid key while t=caps keeps working; isStatsApiGated() in
//     lib/nzbhydra2-normalize.ts classifies that so the UI can say so.
//   - NEVER call /api/stats without an explicit `request`: upstream's no-arg
//     ApiStatsRequest constructor turns nearly every flag on, and the whole
//     calculation is aborted at 30 seconds.
//   - There is no OpenAPI spec (springdoc is commented out in core/pom.xml),
//     and /internalapi/** needs a session cookie rather than the API key — so
//     nothing here may be built on /internalapi. That is also why the indexer
//     list is read-only: enable/disable is an /internalapi route.
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active NZBHydra2 is used.

// Upstream aborts the stats calculation at 30s. Give the request a ceiling just
// past that rather than http-client's 15s default, which would abort a call
// that was about to answer.
const STATS_TIMEOUT = 35_000;

export const HISTORY_PAGE_SIZE = 50;

// Upstream advertises limits: max 100, default 100. Stated explicitly so a
// change to Hydra's default can't silently shrink our result list.
const SEARCH_LIMIT = 100;

/**
 * The key also has to go inside the POST bodies, which serviceRequest can't do
 * — so resolve just the secret here. Deliberately narrow: serviceRequest still
 * owns URL resolution, demo mode, the LAN guard, timeouts, headers and error
 * handling. (Narrow-read precedent: getTautulliImageUrl in tautulli-api.ts.)
 */
function apiKeyFor(instanceId?: string): string {
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId("nzbhydra2");
  if (!targetId) return "";
  return store.instanceSecrets[targetId]?.apiKey ?? "";
}

// --- Caps ---

/**
 * Newznab caps. The only endpoint here that is NOT behind allowApiStats, which
 * makes it two things at once: the connection probe (it validates the key) and
 * the control the stats/history sub-tabs use to tell "the user switched the
 * stats API off" apart from "the key is wrong".
 * `server["@attributes"].appversion` is the NZBHydra2 version string.
 */
export async function getCaps(instanceId?: string): Promise<Nzbhydra2Caps> {
  const res = await serviceRequest<Nzbhydra2Caps | string>("nzbhydra2", "/api", {
    params: { t: "caps", o: "json" },
    // o=json fixes the SUCCESS format; the error path still content-negotiates,
    // so ask for JSON on the wire too and let parseCapsResponse handle XML.
    headers: { Accept: "application/json" },
    instanceId,
  });
  return parseCapsResponse(res);
}

/** Exported for tests: turn a 200 body into caps, or throw. */
export function parseCapsResponse(raw: unknown): Nzbhydra2Caps {
  if (typeof raw === "string") {
    const xmlError = readHydraXmlError(raw);
    if (xmlError) throw new Error(xmlError);
    try {
      return parseCapsResponse(JSON.parse(raw));
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(
          "NZBHydra2 returned a non-JSON response. Check that the URL points " +
            "at NZBHydra2 and not a reverse proxy that rewrites the response.",
        );
      }
      throw err;
    }
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("NZBHydra2 returned an empty response");
  }
  // `server` present means real caps, whatever else the body carries — checked
  // first so a future field named `code` on a good response can't read as a
  // failure.
  if ((raw as Nzbhydra2Caps).server) return raw as Nzbhydra2Caps;
  const jsonError = readHydraJsonError(raw);
  if (jsonError) throw new Error(jsonError);
  throw new Error("NZBHydra2 returned an unrecognized caps response");
}

// --- Indexer statuses ---

/** POST /api/stats/indexers → a BARE ARRAY; there is no envelope. */
export function getIndexerStatuses(
  instanceId?: string,
): Promise<Nzbhydra2IndexerStatus[]> {
  return serviceRequest<Nzbhydra2IndexerStatus[]>(
    "nzbhydra2",
    "/api/stats/indexers",
    {
      method: "POST",
      body: JSON.stringify({ apikey: apiKeyFor(instanceId) }),
      instanceId,
    },
  );
}

// --- Stats ---

export function getStats(
  request: Nzbhydra2StatsRequest,
  instanceId?: string,
): Promise<Nzbhydra2StatsResponse> {
  return serviceRequest<Nzbhydra2StatsResponse>("nzbhydra2", "/api/stats", {
    method: "POST",
    body: JSON.stringify({ apikey: apiKeyFor(instanceId), request }),
    timeout: STATS_TIMEOUT,
    instanceId,
  });
}

// --- History ---

/**
 * HistoryRequest defaults.
 *
 * `sortModel` is NOT optional even though it looks it: History.getHistory
 * guards its first sort branch with `if (sortModel != null)` and then
 * dereferences `sortModel.getColumn()` unconditionally on the very next line,
 * so omitting it is an NPE and a 500. `page` is ONE-based here while the
 * Page<T> response's own `number` is zero-based — don't cross the two.
 * `sortMode` 1 is ASC; upstream treats every other value as DESC.
 */
export function buildHistoryRequest(
  opts: {
    page?: number;
    limit?: number;
    column?: string;
    descending?: boolean;
  } = {},
): Nzbhydra2HistoryRequest {
  return {
    distinct: false,
    onlyCurrentUser: false,
    page: opts.page ?? 1,
    limit: opts.limit ?? HISTORY_PAGE_SIZE,
    filterModel: {},
    sortModel: {
      column: opts.column ?? "time",
      sortMode: opts.descending === false ? 1 : 2,
    },
  };
}

export function getSearchHistory(
  request: Nzbhydra2HistoryRequest,
  instanceId?: string,
): Promise<Nzbhydra2HistoryPage<Nzbhydra2SearchHistoryRow>> {
  return serviceRequest<Nzbhydra2HistoryPage<Nzbhydra2SearchHistoryRow>>(
    "nzbhydra2",
    "/api/history/searches",
    {
      method: "POST",
      body: JSON.stringify({ apikey: apiKeyFor(instanceId), request }),
      instanceId,
    },
  );
}

export function getDownloadHistory(
  request: Nzbhydra2HistoryRequest,
  instanceId?: string,
): Promise<Nzbhydra2HistoryPage<Nzbhydra2DownloadHistoryRow>> {
  return serviceRequest<Nzbhydra2HistoryPage<Nzbhydra2DownloadHistoryRow>>(
    "nzbhydra2",
    "/api/history/downloads",
    {
      method: "POST",
      body: JSON.stringify({ apikey: apiKeyFor(instanceId), request }),
      instanceId,
    },
  );
}

// --- Search ---

export type Nzbhydra2SearchType = "search" | "tvsearch" | "movie" | "book";

export interface Nzbhydra2SearchArgs {
  query: string;
  // `t=search` is the generic newznab free-text search across all categories —
  // the right default for the shared ReleaseSearch box. tvsearch/movie/book
  // only earn their keep when a media id (tvdbid/imdbid/tmdbid/…) or a
  // season/episode is available, which that surface never has.
  type?: Nzbhydra2SearchType;
  // Newznab category filter, comma-separated ids.
  cat?: string;
  // `indexers=` matches indexer NAMES, not ids.
  indexers?: string[];
  offset?: number;
  limit?: number;
}

/**
 * One newznab search against NZBHydra2.
 *
 * There is deliberately no per-indexer fan-out on our side: Hydra IS the
 * fan-out, querying every configured indexer with its own per-indexer timeouts
 * and merging the results, so one request is correct and a slow indexer is
 * Hydra's problem rather than ours (unlike Jackett — see #314).
 *
 * `signal` is the caller's cancel channel: without it a hung fetch outlives the
 * search that started it and later searches dedupe onto the zombie.
 */
export async function searchNzbhydra2(
  args: Nzbhydra2SearchArgs,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<Nzbhydra2SearchItem[]> {
  const params: Record<string, string | number> = {
    t: args.type ?? "search",
    // `o` defaults to XML upstream, so this is required, not decorative.
    o: "json",
    q: args.query,
    limit: args.limit ?? SEARCH_LIMIT,
  };
  if (args.cat) params.cat = args.cat;
  if (args.indexers?.length) params.indexers = args.indexers.join(",");
  if (args.offset) params.offset = args.offset;
  // Deliberately NOT sending `cachetime`: it makes Hydra serve a cached
  // identical query, which would defeat a pull-to-refresh or a deliberate
  // re-search. TanStack Query already dedupes and caches on our side.

  const raw = await serviceRequest<unknown>("nzbhydra2", "/api", {
    params,
    headers: { Accept: "application/json" },
    timeout: INTERACTIVE_SEARCH_TIMEOUT,
    instanceId,
    signal,
  });

  return parseSearchResponse(raw);
}

/**
 * Turn a 200 body into search items, or throw. Exported for tests.
 *
 * Order matters: a body carrying `channel` is a successful search, full stop.
 * Only a body without one is inspected for an error envelope.
 *
 * One failure mode is genuinely undetectable here: with NZBHydra2's
 * `searching.wrapApiErrors` option on (default off), an internal error is
 * rendered as a well-formed EMPTY result — byte-identical to a search that
 * matched nothing. No heuristic can separate them, so we don't invent one; the
 * empty-state copy acknowledges it instead.
 */
export function parseSearchResponse(raw: unknown): Nzbhydra2SearchItem[] {
  if (typeof raw === "string") {
    const xmlError = readHydraXmlError(raw);
    if (xmlError) throw new Error(xmlError);
    try {
      return parseSearchResponse(JSON.parse(raw));
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(
          "NZBHydra2 returned a non-JSON response. Check that the URL points " +
            "at NZBHydra2 and not a reverse proxy that rewrites the response.",
        );
      }
      throw err;
    }
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("NZBHydra2 returned an empty response");
  }

  const channel = (raw as Nzbhydra2SearchResponse).channel;
  if (channel) {
    const item = channel.item;
    // Jackson can collapse a single-element list to a bare object, so a
    // one-result search must decode like a ten-result one.
    return Array.isArray(item) ? item : item ? [item] : [];
  }

  const jsonError = readHydraJsonError(raw);
  if (jsonError) throw new Error(jsonError);

  throw new Error("NZBHydra2 returned an unrecognized search response");
}

import { XMLParser } from "fast-xml-parser";

import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import type {
  JackettIndexer,
  JackettIndexerTestResult,
  JackettResultsResponse,
} from "@/lib/types";

// Jackett API notes:
//   - The apikey travels as a QUERY PARAM, injected centrally by
//     lib/http-client.ts (like SABnzbd) — never add it here.
//   - Only the results/Torznab routes validate the apikey. The admin REST API
//     (/indexers, /server/config, per-indexer config/test) requires the
//     admin-password COOKIE, so indexer management is out of reach and the
//     indexer list comes from the Torznab meta endpoint instead.
//   - No Category[] filtering: RequestOptions.params cannot emit repeated query
//     keys. Single-tracker filtering does not need one — the tracker is a PATH
//     segment (`/indexers/{id}/results`), and "all" is just Jackett's own
//     meta-indexer id for that same route.
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Jackett is used.

// --- Search ---

// JSON manual-search endpoint (the one Jackett's own web UI uses). Returns
// releases across every configured indexer plus per-indexer status rows.
// Jackett queries every tracker synchronously before responding, which blows
// past the 15s default on any real setup — hence the interactive-search
// timeout. `signal` is the caller's cancel channel: without it a hung fetch
// outlives the search that started it and later searches dedupe onto the
// zombie, the "stuck on Searching... forever" report in #314.
// `indexerId` scopes the search to a single tracker (the per-indexer Search
// button in the Jackett indexer list, #315); omitted, it fans out to every
// configured one.
export async function searchAll(
  query: string,
  instanceId?: string,
  signal?: AbortSignal,
  indexerId?: string,
): Promise<JackettResultsResponse> {
  const resp = await runSearch(query, indexerId ?? "all", instanceId, signal);
  assertIndexersUsable(resp);
  return resp;
}

function runSearch(
  query: string,
  indexerId: string,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<JackettResultsResponse> {
  return serviceRequest<JackettResultsResponse>(
    "jackett",
    `/indexers/${encodeURIComponent(indexerId)}/results`,
    {
      params: { Query: query },
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId,
      signal,
    },
  );
}

// Jackett answers 200 with `Results: []` whether nothing matched or every
// tracker blew up, so a broken setup is indistinguishable from a bad query and
// renders as a bare "No results" (#314). Promote its own per-indexer Error
// strings to a thrown error the UI can show. Only when there is nothing at all
// to display: a partial failure still renders what the working trackers
// returned. Exported for tests.
export function assertIndexersUsable(resp: JackettResultsResponse): void {
  if (resp.Results.length > 0) return;
  const indexers = resp.Indexers ?? [];
  const failed = indexers.filter((i) => !!i.Error);
  if (failed.length === 0) return;
  throw new Error(
    `${failed.length} of ${indexers.length} indexer` +
      `${indexers.length === 1 ? "" : "s"} failed. ` +
      `${failed[0].Name}: ${failed[0].Error}`,
  );
}

// --- Test ---

// Per-indexer connectivity check (#315).
//
// Jackett's own Test button POSTs to /api/v2.0/indexers/{id}/test, which carries
// no apikey filter and therefore falls under the global
// `AuthorizeFilter(RequireAuthenticatedUser)` in Jackett's Startup.cs — i.e. the
// admin-password cookie, out of reach here. So reproduce what that endpoint does
// over the apikey-validated results route instead: IndexerManagerService
// .TestIndexer builds a TorznabQuery with an EMPTY SearchTerm, runs it against
// the one indexer, and throws when it comes back with zero releases. Same query,
// same pass/fail rule — the per-indexer row in the JSON response carries the
// tracker's own error string and result count.
export async function testIndexer(
  indexerId: string,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<JackettIndexerTestResult> {
  const resp = await runSearch("", indexerId, instanceId, signal);
  // Jackett echoes one row per queried indexer; match by id and fall back to the
  // sole row, since a tracker whose id differs in case still reports here.
  const row =
    resp.Indexers?.find((i) => i.ID === indexerId) ?? resp.Indexers?.[0];
  const results = row?.Results ?? resp.Results.length;
  const elapsedMs = row?.ElapsedTime;
  if (row?.Error) return { ok: false, results, elapsedMs, error: row.Error };
  if (results === 0) {
    return {
      ok: false,
      results,
      elapsedMs,
      error: "Found no results while browsing this tracker",
    };
  }
  return { ok: true, results, elapsedMs };
}

// --- Indexers ---

// Torznab t=indexers meta endpoint — XML, but the only apikey-validated way to
// list configured indexers. serviceRequest returns non-JSON bodies as strings
// (the "<?xml" head passes its HTML sniff), so fetch-then-parse.
export async function getIndexers(instanceId?: string): Promise<JackettIndexer[]> {
  const xml = await serviceRequest<string>(
    "jackett",
    "/indexers/all/results/torznab/api",
    {
      params: { t: "indexers", configured: "true" },
      instanceId,
    },
  );
  return parseIndexersXml(xml);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep leaf text as strings so numeric-looking titles survive untouched.
  parseTagValue: false,
  parseAttributeValue: false,
  // fast-xml-parser collapses a single-element list to a bare object; a
  // one-indexer Jackett would otherwise decode differently from a ten-indexer
  // one (same quirk lib/xmlrpc.ts pins down for rtorrent).
  isArray: (name) => name === "indexer",
});

// Exported for tests. Tolerates the fields Jackett omits and skips entries
// without an id rather than failing the whole list.
export function parseIndexersXml(xml: string): JackettIndexer[] {
  const doc = parser.parse(xml) as {
    indexers?: {
      indexer?: Array<{
        "@_id"?: string;
        "@_configured"?: string;
        title?: string;
        description?: string;
        type?: string;
      }>;
    };
  };
  const entries = doc.indexers?.indexer ?? [];
  return entries
    .filter((e) => typeof e["@_id"] === "string" && e["@_id"].length > 0)
    .map((e) => ({
      id: e["@_id"] as string,
      name: typeof e.title === "string" && e.title.length > 0 ? e.title : (e["@_id"] as string),
      type: typeof e.type === "string" ? e.type : "unknown",
      configured: e["@_configured"] === "true",
      description: typeof e.description === "string" ? e.description : undefined,
    }));
}

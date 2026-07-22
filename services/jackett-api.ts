import { XMLParser } from "fast-xml-parser";

import { serviceRequest } from "@/lib/http-client";
import type { JackettIndexer, JackettResultsResponse } from "@/lib/types";

// Jackett API notes:
//   - The apikey travels as a QUERY PARAM, injected centrally by
//     lib/http-client.ts (like SABnzbd) — never add it here.
//   - Only the results/Torznab routes validate the apikey. The admin REST API
//     (/indexers, /server/config, per-indexer config/test) requires the
//     admin-password COOKIE, so indexer management is out of reach and the
//     indexer list comes from the Torznab meta endpoint instead.
//   - v1 has no Tracker[]/Category[] filtering: RequestOptions.params cannot
//     emit repeated query keys, and searching "all" matches what the Prowlarr
//     surface does today anyway.
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Jackett is used.

// --- Search ---

// JSON manual-search endpoint (the one Jackett's own web UI uses). Returns
// releases across every configured indexer plus per-indexer status rows.
export function searchAll(
  query: string,
  instanceId?: string,
): Promise<JackettResultsResponse> {
  return serviceRequest<JackettResultsResponse>("jackett", "/indexers/all/results", {
    params: { Query: query },
    instanceId,
  });
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

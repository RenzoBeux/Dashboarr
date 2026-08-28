import { useQuery } from "@tanstack/react-query";

import { searchNzbhydra2 } from "@/services/nzbhydra2-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { hydraAttr, hydraBytes } from "@/lib/nzbhydra2-normalize";
import { Nzbhydra2GrabFlow } from "@/components/indexers/nzbhydra2-grab-flow";
import type {
  IndexerSearchAdapter,
  IndexerSearchOptions,
  UnifiedRelease,
} from "@/lib/indexer-adapter";
import type { Nzbhydra2SearchItem } from "@/lib/types";

const HTTP_URL = /^https?:\/\//i;

export function nzbhydra2ToUnified(item: Nzbhydra2SearchItem): UnifiedRelease {
  // The row's real source. Without it every result would read "NZBHydra2",
  // which is exactly the information a meta-search user needs most.
  const indexer = hydraAttr(item, "hydraIndexerName") ?? "NZBHydra2";

  // Self-authenticating: <hydraBaseUrl>/getnzb/api/<id>?apikey=<install key>.
  const downloadUrl =
    item.link || item.enclosure?.["@attributes"]?.url || undefined;

  // guid alone isn't safe as a list key: Hydra fans out across indexers and
  // some newznab indexers emit bare hashes, so pair it with the indexer name
  // the way the Jackett adapter pairs Guid with TrackerId. The download URL is
  // the last resort because it embeds the per-result id.
  const key = item.guid || item.id || downloadUrl || item.title || "";

  // `comments` is the indexer's details page; `guid` is a URL on some indexers
  // and a bare id on others, so it is only used when it actually is one.
  const infoUrl = [item.comments, item.guid].find(
    (u): u is string => typeof u === "string" && HTTP_URL.test(u),
  );

  return {
    id: `${indexer}:${key}`,
    title: item.title ?? "Unknown release",
    indexer,
    // Newznab carries the size in the enclosure's `length` attribute; most
    // indexers also repeat it as a `size` attr.
    sizeBytes:
      hydraBytes(item.enclosure?.["@attributes"]?.length) ||
      hydraBytes(hydraAttr(item, "size")),
    // Usenet has no swarm. Leaving seeders/leechers undefined is load-bearing:
    // ReleaseCard renders the S:/L: columns whenever they are defined, so a 0
    // here would print "S:0 L:0" on every row.
    protocol: "usenet",
    downloadUrl,
    infoUrl,
    // No `grab`. That field is Prowlarr's server-side POST /search payload
    // ({guid, indexerId}); NZBHydra2's send-to-downloader lives on
    // /internalapi, guarded by the web session rather than the install API key.
    // So the grab is client-side, like Jackett's.
  };
}

export const nzbhydra2IndexerAdapter: IndexerSearchAdapter = {
  serviceId: "nzbhydra2",
  displayName: "NZBHydra2",

  // With NZBHydra2's `searching.wrapApiErrors` option enabled (it is off by
  // default), an internal error comes back as a well-formed empty result with
  // total 0 — indistinguishable from a real zero-result search, and there is no
  // apikey-reachable endpoint that reports per-indexer search status. Rather
  // than invent a heuristic that would sometimes cry wolf, say so here.
  emptyResultsHint:
    "If you expected results, check NZBHydra2's own search history — it can " +
    "report a failed search as an empty one.",

  // The trailing indexer name in the queryKey is the indexer filter, so a
  // filtered search can never collide with an unfiltered one; `select` maps to
  // the unified shape without touching the cached raw items.
  //
  // Interactive indexer searches are slow and expensive: don't auto-retry a
  // transient failure (it multiplies a 90s timeout by three before the user
  // sees anything), consume the queryFn signal so backing out aborts the
  // in-flight fetch, and cache a completed search long enough that returning
  // to the tab doesn't re-run it. Same contract as useRadarrReleases (#290).
  //
  // ONE request, no fan-out: NZBHydra2 is itself the fan-out and applies its
  // own per-indexer timeouts, so the #314 reasoning that forced Jackett to fan
  // out per tracker does not apply here.
  useSearch: (query: string, opts?: IndexerSearchOptions) => {
    const { instanceId: id, enabled } = useInstanceTarget(
      "nzbhydra2",
      opts?.instanceId,
    );
    // The shared `indexerId` slot is a bare string on both sides by design. For
    // NZBHydra2 it carries the indexer NAME — `indexers=` on the newznab
    // endpoint matches names, not ids (see nzbhydra2-indexer-list.tsx, which
    // fills it from the only identity that endpoint exposes).
    const indexerName = opts?.indexerId;
    return useQuery({
      queryKey: ["nzbhydra2", id, "search", query, indexerName],
      queryFn: ({ signal }) =>
        searchNzbhydra2(
          { query, indexers: indexerName ? [indexerName] : undefined },
          id ?? undefined,
          signal,
        ),
      enabled: enabled && query.length >= 2 && !!id,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: false,
      select: (items: Nzbhydra2SearchItem[]) => items.map(nzbhydra2ToUnified),
    });
  },

  GrabFlow: Nzbhydra2GrabFlow,
};

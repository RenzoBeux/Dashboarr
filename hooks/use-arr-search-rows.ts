import { useMemo } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLidarrArtists, useLidarrSearch } from "@/hooks/use-lidarr";
import { useRadarrMovies, useRadarrSearch } from "@/hooks/use-radarr";
import { useSonarrSearch, useSonarrSeries } from "@/hooks/use-sonarr";
import {
  DEFAULT_LIBRARY_MATCH_LIMIT,
  buildLibraryIndex,
  matchLibraryIndex,
  mergeLibraryFirst,
  type LibraryMatchFields,
} from "@/lib/library-search";
import type {
  LidarrArtist,
  LidarrArtistSearchResult,
  RadarrMovie,
  RadarrSearchResult,
  SonarrSearchResult,
  SonarrSeries,
} from "@/lib/types";

// Merged search rows for the three *arr add-search surfaces (#304): whatever the
// query matches in the library you already have, ranked first, then the remote
// /lookup results with the promoted ones deduped out.
//
// The library list is already in cache on every search screen (it was fetched
// only to build the "already added" map), so the local half costs no network and
// renders on the keystroke. Only the lookup is debounced.
//
// One core hook plus three adapters, so the dedicated /movie|series|artist/search
// screens and the global-search sections can never drift apart.

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

/** What useServiceImage needs; RadarrImage/SonarrImage/LidarrImage all satisfy it. */
export interface SearchRowPoster {
  url: string;
  remoteUrl: string;
}

/** Everything ArrLibraryRow needs to render a library hit as a result card. */
export interface LibraryRowDisplay {
  poster?: SearchRowPoster;
  title: string;
  metaLine?: string;
  overview?: string;
}

export type ArrSearchRow<TLookup> =
  | { kind: "library"; key: string; id: number; display: LibraryRowDisplay }
  | {
      kind: "lookup";
      key: string;
      result: TLookup;
      existingId: number | undefined;
    };

export interface ArrSearchRowsResult<TLookup> {
  rows: ArrSearchRow<TLookup>[];
  total: number;
  /** True while the lookup is in flight, including a pending debounce. */
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

/** Per-service glue: the only thing that differs between Radarr/Sonarr/Lidarr. */
export interface ArrSearchAdapter<TLib, TLookup, K> {
  fields: (item: TLib) => LibraryMatchFields;
  libraryKey: (item: TLib) => K;
  lookupKey: (item: TLookup) => K;
  libraryId: (item: TLib) => number;
  display: (item: TLib) => LibraryRowDisplay;
}

/**
 * Merge + shape, split out of the hook so it can be unit tested: library matches
 * become tappable rows, lookup results carry the library id when they're already
 * added. Pure.
 */
export function buildSearchRows<TLib, TLookup, K>(
  matches: readonly TLib[],
  lookupResults: readonly TLookup[] | undefined,
  existingByKey: ReadonlyMap<K, number>,
  adapter: ArrSearchAdapter<TLib, TLookup, K>,
): ArrSearchRow<TLookup>[] {
  return mergeLibraryFirst({
    libraryMatches: matches,
    lookupResults,
    libraryKey: adapter.libraryKey,
    lookupKey: adapter.lookupKey,
  }).map((row): ArrSearchRow<TLookup> =>
    row.kind === "library"
      ? {
          kind: "library",
          key: `lib:${String(adapter.libraryKey(row.item))}`,
          id: adapter.libraryId(row.item),
          display: adapter.display(row.item),
        }
      : {
          kind: "lookup",
          key: `new:${String(adapter.lookupKey(row.item))}`,
          result: row.item,
          existingId: existingByKey.get(adapter.lookupKey(row.item)),
        },
  );
}

/**
 * Whether to show the searching indicator. A pending debounce counts, otherwise
 * the empty state flashes in the gap between the keystroke and the lookup firing.
 * Pure.
 */
export function isLookupPending(
  trimmed: string,
  debouncedQuery: string,
  isFetching: boolean,
): boolean {
  if (trimmed.length < MIN_QUERY) return false;
  return isFetching || debouncedQuery !== trimmed;
}

// The subset of a useQuery result the core hook reads.
interface LookupState<TLookup> {
  data: TLookup[] | undefined;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

function useArrSearchRows<TLib, TLookup, K>(
  query: string,
  debouncedQuery: string,
  libraryData: TLib[] | undefined,
  lookup: LookupState<TLookup>,
  adapter: ArrSearchAdapter<TLib, TLookup, K>,
  limit: number,
): ArrSearchRowsResult<TLookup> {
  const trimmed = query.trim();

  // Normalizing a few thousand titles is cheap but not free, so it happens once
  // per library rather than once per keystroke. TanStack Query hands back a
  // stable array reference while the data is unchanged, so this memo holds.
  const index = useMemo(
    () => buildLibraryIndex(libraryData, adapter.fields),
    [libraryData, adapter],
  );

  const existingByKey = useMemo(() => {
    const map = new Map<K, number>();
    for (const item of libraryData ?? []) {
      map.set(adapter.libraryKey(item), adapter.libraryId(item));
    }
    return map;
  }, [libraryData, adapter]);

  const matches = useMemo(
    () =>
      trimmed.length >= MIN_QUERY ? matchLibraryIndex(index, trimmed, limit) : [],
    [index, trimmed, limit],
  );

  // keepPreviousData keeps the last term's results around while the next one
  // loads, which is what we want mid-typing. Gate on the debounced term rather
  // than the raw one: lookup.data belongs to the debounced term, so deleting
  // below the minimum drops the rows when the debounce catches up instead of
  // blanking the list a beat early and flashing an empty state.
  const lookupResults =
    debouncedQuery.length >= MIN_QUERY ? lookup.data : undefined;

  const rows = useMemo(
    () => buildSearchRows(matches, lookupResults, existingByKey, adapter),
    [matches, lookupResults, existingByKey, adapter],
  );

  return {
    rows,
    total: rows.length,
    isLoading: isLookupPending(trimmed, debouncedQuery, lookup.isFetching),
    isError: lookup.isError,
    error: lookup.error,
  };
}

// --- Radarr ---

export const RADARR_SEARCH_ADAPTER: ArrSearchAdapter<RadarrMovie, RadarrSearchResult, number> = {
  fields: (m) => ({ title: m.title, sortTitle: m.sortTitle, year: m.year }),
  libraryKey: (m) => m.tmdbId,
  lookupKey: (r) => r.tmdbId,
  libraryId: (m) => m.id,
  display: (m) => ({
    poster: m.images?.find((i) => i.coverType === "poster"),
    title: m.title,
    // Mirrors RadarrSearchRow's meta line so the merged list stays uniform.
    metaLine:
      [
        m.year ? String(m.year) : undefined,
        m.collection?.title ? `Part of ${m.collection.title}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    overview: m.overview,
  }),
};

export function useRadarrSearchRows(
  query: string,
  limit: number = DEFAULT_LIBRARY_MATCH_LIMIT,
): ArrSearchRowsResult<RadarrSearchResult> {
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const lookup = useRadarrSearch(debounced);
  const { data: library } = useRadarrMovies();
  return useArrSearchRows(query, debounced, library, lookup, RADARR_SEARCH_ADAPTER, limit);
}

// --- Sonarr ---

export const SONARR_SEARCH_ADAPTER: ArrSearchAdapter<SonarrSeries, SonarrSearchResult, number> = {
  fields: (s) => ({ title: s.title, sortTitle: s.sortTitle, year: s.year }),
  libraryKey: (s) => s.tvdbId,
  lookupKey: (r) => r.tvdbId,
  libraryId: (s) => s.id,
  display: (s) => {
    const seasons = s.statistics?.seasonCount ?? s.seasonCount;
    return {
      poster: s.images?.find((i) => i.coverType === "poster"),
      title: s.title,
      metaLine:
        [
          s.year ? String(s.year) : undefined,
          s.network || undefined,
          seasons ? `${seasons} season${seasons !== 1 ? "s" : ""}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      overview: s.overview,
    };
  },
};

export function useSonarrSearchRows(
  query: string,
  limit: number = DEFAULT_LIBRARY_MATCH_LIMIT,
): ArrSearchRowsResult<SonarrSearchResult> {
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const lookup = useSonarrSearch(debounced);
  const { data: library } = useSonarrSeries();
  return useArrSearchRows(query, debounced, library, lookup, SONARR_SEARCH_ADAPTER, limit);
}

// --- Lidarr ---

// Lidarr has no `title` and no `year`: the library entity is artistName/sortName,
// same asymmetry components/lidarr/music-view.tsx works around for the grid.
export const LIDARR_SEARCH_ADAPTER: ArrSearchAdapter<
  LidarrArtist,
  LidarrArtistSearchResult,
  string
> = {
  fields: (a) => ({ title: a.artistName, sortTitle: a.sortName }),
  libraryKey: (a) => a.foreignArtistId,
  lookupKey: (r) => r.foreignArtistId,
  libraryId: (a) => a.id,
  display: (a) => ({
    poster: a.images?.find((i) => i.coverType === "poster"),
    title: a.artistName,
    metaLine:
      [a.artistType, a.disambiguation].filter(Boolean).join(" · ") || undefined,
    overview: a.overview,
  }),
};

export function useLidarrSearchRows(
  query: string,
  limit: number = DEFAULT_LIBRARY_MATCH_LIMIT,
): ArrSearchRowsResult<LidarrArtistSearchResult> {
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const lookup = useLidarrSearch(debounced);
  const { data: library } = useLidarrArtists();
  return useArrSearchRows(query, debounced, library, lookup, LIDARR_SEARCH_ADAPTER, limit);
}

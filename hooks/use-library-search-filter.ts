import { useMemo } from "react";
import {
  buildLibraryIndex,
  filterLibraryIndex,
  type LibraryIndexEntry,
} from "@/lib/library-search";

type Searchable = { id: number; title: string; sortTitle?: string; year?: number };

/**
 * In-library search as a list predicate: undefined while the query is empty
 * (so empty states can tell "nothing in the library" from "nothing matches"),
 * otherwise true for the items matching it. Matching is the shared library
 * matcher (accents, punctuation, a trailing year); the caller's sort stays.
 */
export function useLibrarySearchFilter<T extends Searchable>(
  items: readonly T[] | undefined,
  query: string,
): ((item: T) => boolean) | undefined {
  const index = useMemo(() => librarySearchIndex(items), [items]);
  return useMemo(() => librarySearchPredicate(index, query), [index, query]);
}

export function librarySearchIndex<T extends Searchable>(
  items: readonly T[] | undefined,
): LibraryIndexEntry<T>[] {
  // Radarr/Sonarr report year 0 for titles with no date yet; leave it out so
  // a trailing year in the query doesn't hide them.
  return buildLibraryIndex(items, (i) => ({
    title: i.title,
    sortTitle: i.sortTitle,
    year: i.year || undefined,
  }));
}

export function librarySearchPredicate<T extends Searchable>(
  index: readonly LibraryIndexEntry<T>[],
  query: string,
): ((item: T) => boolean) | undefined {
  if (!query.trim()) return undefined;
  const ids = new Set(filterLibraryIndex(index, query).map((i) => i.id));
  return (item: T) => ids.has(item.id);
}

/** AND together the active predicates; undefined when none is active. */
export function combineFilters<T>(
  ...filters: (((item: T) => boolean) | undefined)[]
): ((item: T) => boolean) | undefined {
  const active = filters.filter((f): f is (item: T) => boolean => !!f);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return (item: T) => active.every((f) => f(item));
}

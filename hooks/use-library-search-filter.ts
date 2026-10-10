import { useMemo } from "react";
import { buildLibraryIndex, filterLibraryIndex } from "@/lib/library-search";

/**
 * In-library search as a list predicate: undefined while the query is empty
 * (so empty states can tell "nothing in the library" from "nothing matches"),
 * otherwise true for the items matching it. Matching is the shared library
 * matcher (accents, punctuation, a trailing year); the caller's sort stays.
 */
export function useLibrarySearchFilter<
  T extends { id: number; title: string; sortTitle?: string; year?: number },
>(items: readonly T[] | undefined, query: string): ((item: T) => boolean) | undefined {
  const index = useMemo(
    () =>
      buildLibraryIndex(items, (i) => ({ title: i.title, sortTitle: i.sortTitle, year: i.year })),
    [items],
  );
  return useMemo(() => {
    if (!query.trim()) return undefined;
    const ids = new Set(filterLibraryIndex(index, query).map((i) => i.id));
    return (item: T) => ids.has(item.id);
  }, [index, query]);
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

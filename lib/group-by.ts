/**
 * Bucket items by a string key, keeping one entry per distinct key.
 *
 * Groups come back in first-seen order unless `sortKeys` is given, so a list
 * that is already sorted (newest first, say) keeps its order without a second
 * sort. `sortItems` orders the items inside each group. Neither option mutates
 * the input array.
 *
 * Used for day-grouped lists (dashboard calendar, still-pending, the Sonarr
 * week view, Bazarr history), but nothing here is date-specific.
 */
export interface Group<T> {
  key: string;
  items: T[];
}

export function groupBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  opts: {
    sortKeys?: (a: string, b: string) => number;
    sortItems?: (a: T, b: T) => number;
  } = {},
): Group<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  const result = Array.from(groups, ([key, list]) => ({
    key,
    items: opts.sortItems ? list.sort(opts.sortItems) : list,
  }));
  if (opts.sortKeys) {
    const sortKeys = opts.sortKeys;
    result.sort((a, b) => sortKeys(a.key, b.key));
  }
  return result;
}

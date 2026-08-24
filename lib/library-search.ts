// Client-side text matching over the *arr libraries that are already sitting in
// the React Query cache, so a title you own appears before the /movie/lookup,
// /series/lookup or /artist/lookup round trip returns (#304). All three services
// ship the whole library as one unpaginated GET, so this is a linear scan over an
// array we already have — no extra network.
//
// Everything here is pure and generic over the item type: Radarr movies, Sonarr
// series and Lidarr artists all reduce to LibraryMatchFields via an adapter
// (hooks/use-arr-search-rows.ts). Safe to call inside a useMemo.

export interface LibraryMatchFields {
  title: string;
  // The *arr sort title, which already drops leading articles — matching it too
  // is what makes "office" hit "The Office" without any stopword list here.
  // Lidarr's equivalent is `sortName`, and it is optional.
  sortTitle?: string;
  year?: number;
}

export type MergedSearchRow<TLib, TLookup> =
  | { kind: "library"; item: TLib }
  | { kind: "lookup"; item: TLookup };

/** Default cap on promoted library rows, so a broad query can't bury the lookup. */
export const DEFAULT_LIBRARY_MATCH_LIMIT = 20;

const SCORE_EXACT = 100;
const SCORE_PREFIX = 80;
const SCORE_WORD_BOUNDARY = 60;
const SCORE_SUBSTRING = 40;
const SCORE_TOKENS = 20;
const YEAR_ADJUST = 10;

// Punctuation is listed explicitly rather than as "everything that isn't [a-z0-9]"
// so non-latin titles (CJK, Cyrillic, Greek) survive normalization instead of
// being blanked out. Unicode property escapes (\p{L}) would be tidier but have no
// precedent in this codebase and depend on the JS engine build.
const PUNCTUATION = /[._\-–—:;,!?'"“”‘’`´()[\]{}<>/\\|&+*#@~^$%=]+/g;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE = /\s+/g;

/**
 * Fold a title or query down to a comparable form: diacritics stripped,
 * lowercased, punctuation collapsed to single spaces. "Amélie" and "amelie" both
 * become "amelie"; "Marvel's Daredevil" becomes "marvel s daredevil".
 */
export function normalizeSearchText(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

/**
 * Split a trailing 4-digit year off the query ("inception 2010"), leaving the
 * rest as the text to match. A bare year stays text — "2012" should still find
 * the movie called 2012.
 */
export function parseLibraryQuery(query: string): { text: string; year?: number } {
  const text = normalizeSearchText(query);
  const match = /^(.*\S)\s+(\d{4})$/.exec(text);
  if (!match) return { text };
  const year = Number(match[2]);
  if (year < 1870 || year > 2200) return { text };
  return { text: match[1], year };
}

function scoreHaystack(haystack: string, text: string, tokens: string[]): number {
  if (!haystack) return 0;
  if (haystack === text) return SCORE_EXACT;
  if (haystack.startsWith(text)) return SCORE_PREFIX;
  const idx = haystack.indexOf(text);
  if (idx > 0) {
    // A match that begins a word ("the dark KNIGHT rises") reads as far more
    // relevant than one buried mid-word ("mooNKNIGHT").
    return haystack[idx - 1] === " " ? SCORE_WORD_BOUNDARY : SCORE_SUBSTRING;
  }
  // idx is -1 here (idx === 0 was already caught by startsWith).
  // Last resort: every word of the query is somewhere in the title, out of order.
  return tokens.length > 1 && tokens.every((t) => haystack.includes(t))
    ? SCORE_TOKENS
    : 0;
}

/** One library item with its haystacks pre-normalized. Build once per library. */
export interface LibraryIndexEntry<T> {
  item: T;
  fields: LibraryMatchFields;
  title: string;
  sortTitle: string;
}

/**
 * Pre-normalize a whole library so a keystroke doesn't re-fold a few thousand
 * titles. Callers memoize this on the library array identity — TanStack Query
 * keeps that reference stable while the data is unchanged.
 */
export function buildLibraryIndex<T>(
  items: readonly T[] | undefined,
  toFields: (item: T) => LibraryMatchFields,
): LibraryIndexEntry<T>[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const fields = toFields(item);
    return {
      item,
      fields,
      title: normalizeSearchText(fields.title),
      sortTitle: fields.sortTitle ? normalizeSearchText(fields.sortTitle) : "",
    };
  });
}

/**
 * Rank a pre-built index against a query, best match first. Returns at most
 * `limit` items; an empty or unmatched query returns nothing.
 */
export function matchLibraryIndex<T>(
  index: readonly LibraryIndexEntry<T>[],
  query: string,
  limit: number = DEFAULT_LIBRARY_MATCH_LIMIT,
): T[] {
  if (index.length === 0 || limit <= 0) return [];
  const { text, year } = parseLibraryQuery(query);
  if (!text) return [];
  const tokens = text.split(" ").filter(Boolean);

  const scored: { entry: LibraryIndexEntry<T>; score: number }[] = [];
  for (const entry of index) {
    let score = Math.max(
      scoreHaystack(entry.title, text, tokens),
      scoreHaystack(entry.sortTitle, text, tokens),
    );
    if (score === 0) continue;
    if (year !== undefined && entry.fields.year !== undefined) {
      score += entry.fields.year === year ? YEAR_ADJUST : -YEAR_ADJUST;
    }
    scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Shorter title first: "Alien" should outrank "Alien vs. Predator".
    const lenA = a.entry.title.length;
    const lenB = b.entry.title.length;
    if (lenA !== lenB) return lenA - lenB;
    const yearA = a.entry.fields.year ?? 0;
    const yearB = b.entry.fields.year ?? 0;
    if (yearA !== yearB) return yearB - yearA;
    return a.entry.fields.title.localeCompare(b.entry.fields.title);
  });

  return scored.slice(0, limit).map((s) => s.entry.item);
}

/** Convenience for callers that don't hold an index (and for tests). */
export function matchLibraryItems<T>(
  items: readonly T[] | undefined,
  query: string,
  toFields: (item: T) => LibraryMatchFields,
  limit: number = DEFAULT_LIBRARY_MATCH_LIMIT,
): T[] {
  return matchLibraryIndex(buildLibraryIndex(items, toFields), query, limit);
}

/**
 * Library matches first, then the lookup results with the promoted ones removed.
 * Dedup is against the rows actually shown, so an item cut by the match limit
 * still reaches the list through its lookup row.
 */
export function mergeLibraryFirst<TLib, TLookup, K>({
  libraryMatches,
  lookupResults,
  libraryKey,
  lookupKey,
}: {
  libraryMatches: readonly TLib[];
  lookupResults: readonly TLookup[] | undefined;
  libraryKey: (item: TLib) => K;
  lookupKey: (item: TLookup) => K;
}): MergedSearchRow<TLib, TLookup>[] {
  const promoted = new Set<K>();
  const rows: MergedSearchRow<TLib, TLookup>[] = [];

  for (const item of libraryMatches) {
    promoted.add(libraryKey(item));
    rows.push({ kind: "library", item });
  }
  for (const item of lookupResults ?? []) {
    if (promoted.has(lookupKey(item))) continue;
    rows.push({ kind: "lookup", item });
  }
  return rows;
}

import type {
  BazarrLanguageProfile,
  BazarrMovie,
  BazarrSeries,
} from "@/lib/types";

/**
 * Bazarr library view logic: what state each movie/series is in, the filter
 * chip counts, and per-language coverage. Pure.
 */

export type LibraryFilter = "all" | "missing" | "complete" | "noprofile";

export type LibraryItemState = Exclude<LibraryFilter, "all">;

/** A movie or series' subtitle state. No profile wins: nothing is wanted. */
export function classifyMovie(
  movie: Pick<BazarrMovie, "profileId" | "missing_subtitles">,
): LibraryItemState {
  if (movie.profileId == null) return "noprofile";
  return movie.missing_subtitles.length > 0 ? "missing" : "complete";
}

export function classifySeries(
  series: Pick<BazarrSeries, "profileId" | "episodeMissingCount">,
): LibraryItemState {
  if (series.profileId == null) return "noprofile";
  return series.episodeMissingCount > 0 ? "missing" : "complete";
}

export function filterCounts<T>(
  items: readonly T[],
  classify: (item: T) => LibraryItemState,
): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = {
    all: items.length,
    missing: 0,
    complete: 0,
    noprofile: 0,
  };
  for (const item of items) counts[classify(item)] += 1;
  return counts;
}

export interface LanguageCoverage {
  code2: string;
  // Movies whose profile wants the language and that have it.
  have: number;
  // Movies whose profile wants the language.
  total: number;
}

/** The languages each language profile asks for, by profile id. */
export type ProfileLanguages = ReadonlyMap<number, readonly string[]>;

export function profileLanguageMap(
  profiles: readonly BazarrLanguageProfile[],
): ProfileLanguages {
  return new Map(
    profiles.map((p) => [
      p.profileId,
      [...new Set(p.items.map((i) => i.language))],
    ]),
  );
}

/**
 * Per-language coverage across movies: for every language any profile asks
 * for, how many of the movies wanting it have it. Ordered by how many movies
 * want it, so the languages that matter most come first.
 */
export function computeLanguageCoverage(
  movies: readonly Pick<BazarrMovie, "profileId" | "missing_subtitles">[],
  // The same map filterMovies takes, so a bar and its list can't disagree.
  profileLangs: ProfileLanguages,
): LanguageCoverage[] {
  const totals = new Map<string, LanguageCoverage>();
  for (const movie of movies) {
    if (movie.profileId == null) continue;
    const missing = new Set(movie.missing_subtitles.map((m) => m.code2));
    for (const code2 of profileLangs.get(movie.profileId) ?? []) {
      const entry = totals.get(code2) ?? { code2, have: 0, total: 0 };
      entry.total += 1;
      if (!missing.has(code2)) entry.have += 1;
      totals.set(code2, entry);
    }
  }
  return [...totals.values()].sort(
    (a, b) => b.total - a.total || a.code2.localeCompare(b.code2),
  );
}

/**
 * A coverage bar's filter: the movies missing the language, or the movies
 * that have it. "Have" counts the same way the bar does — the profile wants
 * the language and it isn't missing — so the list length matches the bar.
 */
export interface LanguageFilter {
  code2: string;
  show: "missing" | "have";
}

/** A tap on a coverage bar cycles off → missing → have → off. */
export function nextLanguageFilter(
  current: LanguageFilter | null,
  code2: string,
): LanguageFilter | null {
  if (current?.code2 !== code2) return { code2, show: "missing" };
  return current.show === "missing" ? { code2, show: "have" } : null;
}

function matchesLanguage(
  movie: Pick<BazarrMovie, "profileId" | "missing_subtitles">,
  lang: LanguageFilter,
  profileLangs: ProfileLanguages,
): boolean {
  const missing = movie.missing_subtitles.some((s) => s.code2 === lang.code2);
  if (lang.show === "missing") return missing;
  if (missing || movie.profileId == null) return false;
  return profileLangs.get(movie.profileId)?.includes(lang.code2) ?? false;
}

/**
 * Apply the filter chips (and an optional language filter from a coverage
 * bar) to the movies.
 */
export function filterMovies<
  T extends Pick<BazarrMovie, "profileId" | "missing_subtitles">,
>(
  movies: readonly T[],
  filter: LibraryFilter,
  lang?: LanguageFilter | null,
  profileLangs: ProfileLanguages = new Map(),
): T[] {
  return movies.filter((m) => {
    if (lang && !matchesLanguage(m, lang, profileLangs)) return false;
    return filter === "all" || classifyMovie(m) === filter;
  });
}

export function filterSeries<
  T extends Pick<BazarrSeries, "profileId" | "episodeMissingCount">,
>(series: readonly T[], filter: LibraryFilter): T[] {
  return filter === "all"
    ? [...series]
    : series.filter((s) => classifySeries(s) === filter);
}

/** Share of a series' downloaded episodes with every wanted subtitle (0–1). */
export function seriesCoverage(
  series: Pick<BazarrSeries, "episodeFileCount" | "episodeMissingCount">,
): number {
  if (series.episodeFileCount <= 0) return 0;
  const complete = Math.max(
    0,
    series.episodeFileCount - series.episodeMissingCount,
  );
  return complete / series.episodeFileCount;
}

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
export function classifyMovie(movie: Pick<BazarrMovie, "profileId" | "missing_subtitles">): LibraryItemState {
  if (movie.profileId == null) return "noprofile";
  return movie.missing_subtitles.length > 0 ? "missing" : "complete";
}

export function classifySeries(series: Pick<BazarrSeries, "profileId" | "episodeMissingCount">): LibraryItemState {
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

/**
 * Per-language coverage across movies: for every language any profile asks
 * for, how many of the movies wanting it have it. Ordered by how many movies
 * want it, so the languages that matter most come first.
 */
export function computeLanguageCoverage(
  movies: readonly Pick<BazarrMovie, "profileId" | "missing_subtitles">[],
  profiles: readonly BazarrLanguageProfile[],
): LanguageCoverage[] {
  const profileLangs = new Map(
    profiles.map((p) => [p.profileId, [...new Set(p.items.map((i) => i.language))]]),
  );
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
  return [...totals.values()].sort((a, b) => b.total - a.total || a.code2.localeCompare(b.code2));
}

/**
 * Apply the filter chips (and an optional "missing this language" filter from
 * a coverage bar) to the movies.
 */
export function filterMovies<T extends Pick<BazarrMovie, "profileId" | "missing_subtitles">>(
  movies: readonly T[],
  filter: LibraryFilter,
  missingLanguage?: string | null,
): T[] {
  return movies.filter((m) => {
    if (missingLanguage && !m.missing_subtitles.some((s) => s.code2 === missingLanguage)) {
      return false;
    }
    return filter === "all" || classifyMovie(m) === filter;
  });
}

export function filterSeries<T extends Pick<BazarrSeries, "profileId" | "episodeMissingCount">>(
  series: readonly T[],
  filter: LibraryFilter,
): T[] {
  return filter === "all" ? [...series] : series.filter((s) => classifySeries(s) === filter);
}

/** Share of a series' downloaded episodes with every wanted subtitle (0–1). */
export function seriesCoverage(series: Pick<BazarrSeries, "episodeFileCount" | "episodeMissingCount">): number {
  if (series.episodeFileCount <= 0) return 0;
  const complete = Math.max(0, series.episodeFileCount - series.episodeMissingCount);
  return complete / series.episodeFileCount;
}

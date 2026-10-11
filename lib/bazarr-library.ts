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
  // Movies whose profile wants the language and that have a subtitle in it
  // (a file or an embedded track) that Bazarr doesn't still list as missing.
  have: number;
  // Movies whose profile wants the language and Bazarr lists it as missing.
  missing: number;
  // Movies whose profile wants the language.
  total: number;
}

type CoverageMovie = Pick<BazarrMovie, "profileId" | "missing_subtitles" | "subtitles">;

const missesLanguage = (movie: CoverageMovie, code2: string) =>
  movie.missing_subtitles.some((s) => s.code2 === code2);
// A track Bazarr doesn't accept (e.g. only a forced English subtitle when the
// profile wants regular English) leaves the language listed as missing; it
// isn't had, so "have" and "missing" never overlap.
const hasLanguage = (movie: CoverageMovie, code2: string) =>
  !missesLanguage(movie, code2) &&
  movie.subtitles.some((s) => s.code2 === code2);

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
 * for, how many of the movies wanting it have it and how many Bazarr still
 * lists as missing it. Ordered by how many movies want it, so the languages
 * that matter most come first.
 *
 * Coverage counts what is actually there, not "not missing": Bazarr empties
 * `missing_subtitles` once a profile's cutoff is met and leaves out languages
 * excluded by the audio track, so a movie can be neither — it doesn't have
 * the language and Bazarr won't look for it. That movie lowers the share
 * without appearing under "missing".
 */
export function computeLanguageCoverage(
  movies: readonly CoverageMovie[],
  // The same map filterMovies takes, so a bar and its list can't disagree.
  profileLangs: ProfileLanguages,
): LanguageCoverage[] {
  const totals = new Map<string, LanguageCoverage>();
  for (const movie of movies) {
    if (movie.profileId == null) continue;
    for (const code2 of profileLangs.get(movie.profileId) ?? []) {
      const entry = totals.get(code2) ?? { code2, have: 0, missing: 0, total: 0 };
      entry.total += 1;
      if (hasLanguage(movie, code2)) entry.have += 1;
      if (missesLanguage(movie, code2)) entry.missing += 1;
      totals.set(code2, entry);
    }
  }
  return [...totals.values()].sort(
    (a, b) => b.total - a.total || a.code2.localeCompare(b.code2),
  );
}

/**
 * A coverage bar's filter: the movies missing the language, or the movies
 * that have it. Both count the way the bar does — only movies whose profile
 * wants the language — so the list length matches the bar's number.
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
  movie: CoverageMovie,
  lang: LanguageFilter,
  profileLangs: ProfileLanguages,
): boolean {
  if (movie.profileId == null) return false;
  if (!profileLangs.get(movie.profileId)?.includes(lang.code2)) return false;
  return lang.show === "missing"
    ? missesLanguage(movie, lang.code2)
    : hasLanguage(movie, lang.code2);
}

/**
 * Apply the filter chips (and an optional language filter from a coverage
 * bar) to the movies.
 */
export function filterMovies<T extends CoverageMovie>(
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

/** Downloaded episodes with every wanted subtitle. */
export function seriesSubtitledCount(
  series: Pick<BazarrSeries, "episodeFileCount" | "episodeMissingCount">,
): number {
  return Math.max(0, series.episodeFileCount - series.episodeMissingCount);
}

/** Share of a series' downloaded episodes with every wanted subtitle (0–1). */
export function seriesCoverage(
  series: Pick<BazarrSeries, "episodeFileCount" | "episodeMissingCount">,
): number {
  if (series.episodeFileCount <= 0) return 0;
  return seriesSubtitledCount(series) / series.episodeFileCount;
}

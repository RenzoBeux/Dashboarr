import {
  classifyMovie,
  classifySeries,
  computeLanguageCoverage,
  filterCounts,
  filterMovies,
  filterSeries,
  seriesCoverage,
} from "./bazarr-library";
import type { BazarrLanguageProfile } from "./types";

const miss = (code2: string) => ({ name: code2, code2, code3: code2, forced: false, hi: false });
const movie = (profileId: number | null, missing: string[] = []) => ({
  profileId,
  missing_subtitles: missing.map(miss),
});
const profile = (profileId: number, langs: string[]): BazarrLanguageProfile => ({
  profileId,
  name: langs.join("+"),
  cutoff: null,
  items: langs.map((language, id) => ({ id, language, forced: "False", hi: "False" })),
});

describe("classify", () => {
  it("puts no profile first, then missing, else complete", () => {
    expect(classifyMovie(movie(null, ["en"]))).toBe("noprofile");
    expect(classifyMovie(movie(1, ["en"]))).toBe("missing");
    expect(classifyMovie(movie(1))).toBe("complete");
    expect(classifySeries({ profileId: 1, episodeMissingCount: 3 })).toBe("missing");
    expect(classifySeries({ profileId: null, episodeMissingCount: 3 })).toBe("noprofile");
  });

  it("counts every chip", () => {
    expect(
      filterCounts([movie(1, ["en"]), movie(1), movie(null), movie(2, ["de"])], classifyMovie),
    ).toEqual({ all: 4, missing: 2, complete: 1, noprofile: 1 });
  });
});

describe("computeLanguageCoverage", () => {
  it("counts movies wanting each language and those having it", () => {
    const coverage = computeLanguageCoverage(
      [movie(1), movie(1, ["de"]), movie(2, ["en"]), movie(null)],
      [profile(1, ["en", "de"]), profile(2, ["en"])],
    );
    expect(coverage).toEqual([
      { code2: "en", have: 2, total: 3 },
      { code2: "de", have: 1, total: 2 },
    ]);
  });

  it("counts a language listed twice in a profile once", () => {
    const p: BazarrLanguageProfile = {
      ...profile(1, ["en"]),
      items: [
        { id: 1, language: "en", forced: "False", hi: "False" },
        { id: 2, language: "en", forced: "True", hi: "False" },
      ],
    };
    expect(computeLanguageCoverage([movie(1)], [p])).toEqual([{ code2: "en", have: 1, total: 1 }]);
  });
});

describe("filters", () => {
  const movies = [movie(1, ["de"]), movie(1), movie(null), movie(1, ["en", "de"])];

  it("filters by chip", () => {
    expect(filterMovies(movies, "missing")).toHaveLength(2);
    expect(filterMovies(movies, "all")).toHaveLength(4);
  });

  it("narrows to movies missing a language from a coverage bar", () => {
    expect(filterMovies(movies, "all", "en")).toHaveLength(1);
    expect(filterMovies(movies, "missing", "de")).toHaveLength(2);
  });

  it("filters series", () => {
    const series = [
      { profileId: 1, episodeMissingCount: 0 },
      { profileId: 1, episodeMissingCount: 2 },
    ];
    expect(filterSeries(series, "complete")).toHaveLength(1);
  });
});

describe("seriesCoverage", () => {
  it("is the share of episodes with every wanted subtitle", () => {
    expect(seriesCoverage({ episodeFileCount: 10, episodeMissingCount: 3 })).toBeCloseTo(0.7);
    expect(seriesCoverage({ episodeFileCount: 0, episodeMissingCount: 0 })).toBe(0);
  });
});

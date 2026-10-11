import {
  classifyMovie,
  classifySeries,
  computeLanguageCoverage,
  filterCounts,
  filterMovies,
  nextLanguageFilter,
  profileLanguageMap,
  filterSeries,
  seriesCoverage,
} from "./bazarr-library";
import type { BazarrLanguageProfile } from "./types";

const miss = (code2: string) => ({
  name: code2,
  code2,
  code3: code2,
  forced: false,
  hi: false,
});
const sub = (code2: string) => ({ ...miss(code2), path: `/m/Film.${code2}.srt` });
const movie = (
  profileId: number | null,
  missing: string[] = [],
  has: string[] = [],
  audio: string[] = ["en"],
) => ({
  profileId,
  missing_subtitles: missing.map(miss),
  subtitles: has.map(sub),
  audio_language: audio.map((code2) => ({ name: code2, code2, code3: code2 })),
});
const profile = (
  profileId: number,
  langs: string[],
  audioExclude: string[] = [],
): BazarrLanguageProfile => ({
  profileId,
  name: langs.join("+"),
  cutoff: null,
  items: langs.map((language, id) => ({
    id,
    language,
    forced: "False",
    hi: "False",
    audio_exclude: audioExclude.includes(language) ? "True" : "False",
  })),
});

describe("classify", () => {
  it("puts no profile first, then missing, else complete", () => {
    expect(classifyMovie(movie(null, ["en"]))).toBe("noprofile");
    expect(classifyMovie(movie(1, ["en"]))).toBe("missing");
    expect(classifyMovie(movie(1))).toBe("complete");
    expect(classifySeries({ profileId: 1, episodeMissingCount: 3 })).toBe(
      "missing",
    );
    expect(classifySeries({ profileId: null, episodeMissingCount: 3 })).toBe(
      "noprofile",
    );
  });

  it("counts every chip", () => {
    expect(
      filterCounts(
        [movie(1, ["en"]), movie(1), movie(null), movie(2, ["de"])],
        classifyMovie,
      ),
    ).toEqual({ all: 4, missing: 2, complete: 1, noprofile: 1 });
  });
});

describe("computeLanguageCoverage", () => {
  it("counts movies wanting each language, having it and missing it", () => {
    const coverage = computeLanguageCoverage(
      [movie(1, [], ["en", "de"]), movie(1, ["de"], ["en"]), movie(2, ["en"]), movie(null, [], ["en"])],
      profileLanguageMap([profile(1, ["en", "de"]), profile(2, ["en"])]),
    );
    expect(coverage).toEqual([
      { code2: "en", have: 2, missing: 1, total: 3 },
      { code2: "de", have: 1, missing: 1, total: 2 },
    ]);
  });

  it("doesn't count a language as had just because Bazarr stopped looking", () => {
    // Cutoff met on English: German is neither had nor listed as missing.
    const coverage = computeLanguageCoverage(
      [movie(1, [], ["en"])],
      profileLanguageMap([profile(1, ["en", "de"])]),
    );
    const en = coverage.find((c) => c.code2 === "en");
    const de = coverage.find((c) => c.code2 === "de");
    expect(en).toEqual({ code2: "en", have: 1, missing: 0, total: 1 });
    expect(de).toEqual({ code2: "de", have: 0, missing: 0, total: 1 });
  });

  it("doesn't count a language Bazarr still lists as missing as had", () => {
    // Only a forced English track: Bazarr keeps English as missing.
    expect(
      computeLanguageCoverage([movie(1, ["en"], ["en"])], profileLanguageMap([profile(1, ["en"])])),
    ).toEqual([{ code2: "en", have: 0, missing: 1, total: 1 }]);
  });

  it("doesn't count a language the profile excludes for the movie's audio", () => {
    // German excluded when the audio is German: the German-audio movie
    // doesn't want it, the English-audio one does.
    const langs = profileLanguageMap([profile(1, ["en", "de"], ["de"])]);
    const coverage = computeLanguageCoverage(
      [movie(1, [], ["en"], ["de"]), movie(1, ["de"], ["en"], ["en"])],
      langs,
    );
    expect(coverage.find((c) => c.code2 === "de")).toEqual({
      code2: "de",
      have: 0,
      missing: 1,
      total: 1,
    });
    expect(
      filterMovies([movie(1, [], ["de"], ["de"])], "all", { code2: "de", show: "have" }, langs),
    ).toHaveLength(0);
  });

  it("still wants a language another profile item doesn't exclude", () => {
    const p: BazarrLanguageProfile = {
      ...profile(1, ["de"]),
      items: [
        { id: 1, language: "de", forced: "False", hi: "False", audio_exclude: "True" },
        { id: 2, language: "de", forced: "True", hi: "False", audio_exclude: "False" },
      ],
    };
    expect(
      computeLanguageCoverage([movie(1, [], ["de"], ["de"])], profileLanguageMap([p])),
    ).toEqual([{ code2: "de", have: 1, missing: 0, total: 1 }]);
  });

  it("counts a language listed twice in a profile once", () => {
    const p: BazarrLanguageProfile = {
      ...profile(1, ["en"]),
      items: [
        { id: 1, language: "en", forced: "False", hi: "False" },
        { id: 2, language: "en", forced: "True", hi: "False" },
      ],
    };
    expect(computeLanguageCoverage([movie(1, [], ["en"])], profileLanguageMap([p]))).toEqual([
      { code2: "en", have: 1, missing: 0, total: 1 },
    ]);
  });
});

describe("filters", () => {
  const movies = [
    movie(1, ["de"], ["en"]),
    movie(1, [], ["en", "de"]),
    movie(null, [], ["en"]),
    movie(1, ["en", "de"]),
    // Cutoff met on German: English neither had nor missing.
    movie(1, [], ["de"]),
  ];
  const langs = profileLanguageMap([profile(1, ["en", "de"])]);
  const coverageOf = (code2: string) =>
    computeLanguageCoverage(movies, langs).find((c) => c.code2 === code2)!;

  it("filters by chip", () => {
    expect(filterMovies(movies, "missing")).toHaveLength(2);
    expect(filterMovies(movies, "all")).toHaveLength(5);
  });

  it("narrows to movies missing a language, counted like the bar", () => {
    const en = filterMovies(movies, "all", { code2: "en", show: "missing" }, langs);
    expect(en).toEqual([movies[3]]);
    expect(en).toHaveLength(coverageOf("en").missing);
    expect(
      filterMovies(movies, "missing", { code2: "de", show: "missing" }, langs),
    ).toHaveLength(2);
  });

  it("only lists a missing language the movie's profile still wants", () => {
    // Profile 1 exists but asks for English and German only.
    const stale = [movie(1, ["fr"])];
    expect(
      filterMovies(stale, "all", { code2: "fr", show: "missing" }, langs),
    ).toHaveLength(0);
  });

  it("narrows to movies that have a language, counted like the bar", () => {
    const have = filterMovies(movies, "all", { code2: "en", show: "have" }, langs);
    // The no-profile movie doesn't want English, and the cutoff movie
    // doesn't have it, so neither is counted.
    expect(have).toEqual([movies[0], movies[1]]);
    expect(have).toHaveLength(coverageOf("en").have);
  });

  it("cycles a coverage bar off → missing → have → off", () => {
    const missing = nextLanguageFilter(null, "en");
    expect(missing).toEqual({ code2: "en", show: "missing" });
    const have = nextLanguageFilter(missing, "en");
    expect(have).toEqual({ code2: "en", show: "have" });
    expect(nextLanguageFilter(have, "en")).toBeNull();
    // Another language starts over at missing.
    expect(nextLanguageFilter(have, "de")).toEqual({
      code2: "de",
      show: "missing",
    });
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
    expect(
      seriesCoverage({ episodeFileCount: 10, episodeMissingCount: 3 }),
    ).toBeCloseTo(0.7);
    expect(
      seriesCoverage({ episodeFileCount: 0, episodeMissingCount: 0 }),
    ).toBe(0);
  });
});

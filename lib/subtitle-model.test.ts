import {
  buildAudioTags,
  buildCoverageGrid,
  buildSubtitleChips,
  buildSubtitleRows,
  fitChips,
  mediaAudioTags,
  seasonMissingTargets,
  subtitleCoverage,
} from "./subtitle-model";
import type { BazarrEpisode, BazarrSubtitle } from "./types";

const sub = (code2: string, path: string | null, extra: Partial<BazarrSubtitle> = {}): BazarrSubtitle => ({
  name: code2.toUpperCase(),
  code2,
  code3: code2,
  path,
  forced: false,
  hi: false,
  ...extra,
});
const miss = (code2: string, extra: { forced?: boolean; hi?: boolean } = {}) => ({
  name: code2.toUpperCase(),
  code2,
  code3: code2,
  forced: extra.forced ?? false,
  hi: extra.hi ?? false,
});

describe("buildSubtitleRows", () => {
  const rows = buildSubtitleRows({
    subtitles: [
      sub("en", null, { embedded_track_id: 2 }),
      sub("de", "/m/Film.de.srt"),
      sub("de", "/m/Film.de.forced.srt", { forced: true }),
    ],
    missing_subtitles: [miss("fr")],
  });

  it("orders missing, then files, then embedded", () => {
    expect(rows.map((r) => `${r.code2}:${r.state}`)).toEqual([
      "fr:missing",
      "de:present",
      "de:present",
      "en:embedded",
    ]);
  });

  it("gives every row a distinct, stable key", () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows.find((r) => r.forced)?.key).toBe("de|f|/m/Film.de.forced.srt");
  });

  it("keeps keys distinct for embedded tracks without ids (before Bazarr 1.6)", () => {
    const keys = buildSubtitleRows({
      subtitles: [sub("en", null), sub("en", null)],
      missing_subtitles: [],
    }).map((r) => r.key);
    expect(keys).toEqual(["en||track", "en||track#1"]);
  });

  it("handles a missing or null list", () => {
    expect(buildSubtitleRows({ subtitles: null, missing_subtitles: undefined })).toEqual([]);
  });
});

describe("buildSubtitleChips / subtitleCoverage", () => {
  it("keeps one chip per language and flags, preferring the best state", () => {
    const chips = buildSubtitleChips(
      buildSubtitleRows({
        subtitles: [sub("en", null), sub("en", "/m/f.en.srt"), sub("de", "/m/f.de.srt", { forced: true })],
        missing_subtitles: [miss("fr"), miss("de")],
      }),
    );
    expect(chips.map((c) => `${c.code2}${c.forced ? "F" : ""}:${c.state}`)).toEqual([
      "deF:present",
      "en:present",
      "de:missing",
      "fr:missing",
    ]);
    expect(subtitleCoverage(chips)).toEqual({ have: 2, total: 4 });
  });
});

describe("buildAudioTags", () => {
  it("dedupes arr audio tracks and marks the original language", () => {
    expect(buildAudioTags("eng/eng/ger", { id: 1, name: "English" })).toEqual([
      { code2: "en", name: "English", original: true },
      { code2: "de", name: "German", original: false },
    ]);
  });

  it("accepts Bazarr's audio_language list", () => {
    expect(
      buildAudioTags(
        [
          { name: "French", code2: "fr", code3: "fre" },
          { name: "French", code2: "fr", code3: "fre" },
        ],
        "French",
      ),
    ).toEqual([{ code2: "fr", name: "French", original: true }]);
  });

  it("marks a base-language track original for a regional original language", () => {
    expect(buildAudioTags("por/eng", { id: 1, name: "Portuguese (Brazil)" })).toEqual([
      { code2: "pt", name: "Portuguese", original: true },
      { code2: "en", name: "English", original: false },
    ]);
  });

  it("marks a Bokmål track original for a Norwegian production", () => {
    expect(buildAudioTags("nob", { id: 1, name: "Norwegian" })[0].original).toBe(true);
  });

  it("prefers an exact original over a regional variant's base", () => {
    expect(
      buildAudioTags(
        [
          { name: "Spanish", code2: "es", code3: "spa" },
          { name: "Spanish (Latino)", code2: "ea", code3: "spl" },
        ],
        "Spanish",
      ).map((t) => t.original),
    ).toEqual([true, false]);
  });

  it("keeps a Bazarr audio language the code table doesn't know", () => {
    expect(buildAudioTags([{ name: "Pashto", code2: "ps", code3: "pus" }])).toEqual([
      { code2: "ps", name: "Pashto", original: false },
    ]);
  });

  it("is empty without audio info", () => {
    expect(buildAudioTags(undefined)).toEqual([]);
  });
});

describe("mediaAudioTags", () => {
  const bazarr = [{ name: "French", code2: "fr", code3: "fre" }];

  it("prefers the file's audio languages", () => {
    expect(mediaAudioTags("eng/ger", bazarr, "English")).toEqual([
      { code2: "en", name: "English", original: true },
      { code2: "de", name: "German", original: false },
    ]);
  });

  it("falls back to Bazarr when the file has only untagged tracks", () => {
    expect(mediaAudioTags("und/und", bazarr, "French")).toEqual([
      { code2: "fr", name: "French", original: true },
    ]);
  });

  it("falls back to Bazarr without file audio info", () => {
    expect(mediaAudioTags(undefined, bazarr).map((t) => t.code2)).toEqual(["fr"]);
  });

  it("is empty with neither", () => {
    expect(mediaAudioTags(undefined, undefined)).toEqual([]);
    expect(mediaAudioTags("", null)).toEqual([]);
  });
});

describe("fitChips", () => {
  // chip 30, gap 4, "+N" 30
  it("shows everything that fits", () => {
    expect(fitChips(3, 98, 30, 4, 30)).toBe(3);
  });

  it("leaves room for the +N chip when it doesn't", () => {
    // 4 chips need 132; with +N: n*(34) + 30 <= 120 → n = 2
    expect(fitChips(4, 120, 30, 4, 30)).toBe(2);
  });

  it("shows every chip on an exact fit instead of a +1 in the last one's place", () => {
    expect(fitChips(2, 64, 30, 4, 30)).toBe(2);
    expect(fitChips(2, 63, 30, 4, 30)).toBe(0);
  });

  it("handles no room and no chips", () => {
    expect(fitChips(5, 20, 30, 4, 30)).toBe(0);
    expect(fitChips(0, 200, 30, 4, 30)).toBe(0);
  });
});

const ep = (
  season: number,
  episode: number,
  subtitles: BazarrSubtitle[],
  missing: ReturnType<typeof miss>[],
): BazarrEpisode => ({
  sonarrSeriesId: 1,
  sonarrEpisodeId: season * 100 + episode,
  season,
  episode,
  title: `E${episode}`,
  path: "/tv/x",
  profileId: 1,
  audio_language: [],
  subtitles,
  missing_subtitles: missing,
});

describe("buildCoverageGrid", () => {
  const episodes = [
    ep(1, 2, [sub("en", "/a.en.srt")], [miss("de")]),
    ep(1, 1, [sub("en", null), sub("de", "/a.de.srt")], []),
    ep(2, 1, [], [miss("en"), miss("de")]),
  ];

  it("uses the profile's languages as columns", () => {
    const grid = buildCoverageGrid(episodes, {
      profileId: 1,
      name: "EN+DE",
      cutoff: null,
      items: [
        { id: 1, language: "en", forced: "False", hi: "False" },
        { id: 2, language: "de", forced: "False", hi: "False" },
        { id: 3, language: "fr", forced: "False", hi: "False" },
      ],
    });
    expect(grid.languages.map((l) => l.code2)).toEqual(["en", "de", "fr"]);
    expect(grid.seasons.map((s) => s.season)).toEqual([2, 1]);
    const s1 = grid.seasons[1];
    expect(s1.episodes.map((e) => e.cells)).toEqual([
      ["embedded", "present", "unwanted"],
      ["present", "missing", "unwanted"],
    ]);
    expect(s1.gaps).toBe(1);
    expect(grid.seasons[0].gaps).toBe(1);
  });

  it("keeps plain and HI columns of one language apart", () => {
    const grid = buildCoverageGrid([
      ep(1, 1, [sub("en", "/a.en.srt")], [miss("en", { hi: true })]),
      ep(1, 2, [sub("en", "/b.en.hi.srt", { hi: true })], []),
    ]);
    expect(grid.languages.map((l) => l.key)).toEqual(["en|", "en|h"]);
    expect(grid.seasons[0].episodes.map((e) => e.cells)).toEqual([
      ["present", "missing"],
      ["present", "present"],
    ]);
  });

  it("falls back to the languages episodes have without a profile", () => {
    expect(buildCoverageGrid(episodes).languages.map((l) => l.code2)).toEqual(["de", "en"]);
  });
});

describe("seasonMissingTargets", () => {
  it("lists only that season's episodes with missing languages", () => {
    const targets = seasonMissingTargets(
      [ep(1, 1, [], [miss("de")]), ep(1, 2, [], []), ep(2, 1, [], [miss("en")])],
      1,
    );
    expect(targets.map((t) => t.episode.episode)).toEqual([1]);
    expect(targets[0].languages.map((l) => l.code2)).toEqual(["de"]);
  });
});

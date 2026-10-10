import {
  buildFpsAction,
  buildShiftAction,
  deleteParams,
  downloadResultParams,
  isEmbedded,
  isModifiable,
  searchParams,
  toolParams,
  uploadFields,
  type SubtitleTarget,
} from "./bazarr-subtitle-tools";
import type { BazarrSubtitle } from "./types";

const movie: SubtitleTarget = { type: "movie", radarrId: 12 };
const episode: SubtitleTarget = { type: "episode", seriesId: 3, episodeId: 99 };

const external: BazarrSubtitle = {
  name: "German",
  code2: "de",
  code3: "ger",
  path: "/movies/Film (2023)/Film.de.forced.srt",
  forced: true,
  hi: false,
  id: 501,
};
const embedded: BazarrSubtitle = {
  name: "English",
  code2: "en",
  code3: "eng",
  path: null,
  forced: false,
  hi: true,
  embedded_track_id: 3,
  id: 502,
};

describe("boolean encoding per route", () => {
  it("search sends True/False", () => {
    expect(searchParams(episode, { code2: "fr", forced: false, hi: true })).toEqual({
      seriesid: 3,
      episodeid: 99,
      language: "fr",
      forced: "False",
      hi: "True",
    });
  });

  it("upload sends lowercase true/false", () => {
    expect(uploadFields(movie, { code2: "de", forced: true, hi: false })).toEqual({
      radarrid: 12,
      language: "de",
      forced: "true",
      hi: "false",
    });
  });

  it("tools send True/False", () => {
    const p = toolParams(movie, external, { kind: "sync" });
    expect(p.forced).toBe("True");
    expect(p.hi).toBe("False");
  });

  it("download echoes the search result's own strings", () => {
    expect(
      downloadResultParams(movie, {
        provider: "opensubtitlescom",
        subtitle: "opaque-token",
        forced: "False",
        hearing_impaired: "True",
        original_format: "False",
      }),
    ).toEqual({
      radarrid: 12,
      provider: "opensubtitlescom",
      subtitle: "opaque-token",
      hi: "True",
      forced: "False",
      original_format: "False",
    });
  });
});

describe("toolParams", () => {
  it("addresses an external file by its exact path", () => {
    expect(toolParams(episode, external, { kind: "mod", mod: "remove_HI" })).toEqual({
      action: "remove_HI",
      language: "de",
      type: "episode",
      id: 99,
      forced: "True",
      hi: "False",
      path: "/movies/Film (2023)/Film.de.forced.srt",
    });
  });

  it("addresses an embedded track by its subtitle id", () => {
    const p = toolParams(movie, embedded, { kind: "extract" });
    expect(p).toMatchObject({ action: "extract", type: "movie", id: 12, subtitles_id: 502 });
    expect(p).not.toHaveProperty("path");
  });

  it("sends the target language for translate", () => {
    expect(toolParams(movie, external, { kind: "translate", to: "fr" })).toMatchObject({
      action: "translate",
      language: "fr",
    });
  });
});

describe("deleteParams", () => {
  it("names the file and its flags", () => {
    expect(deleteParams(movie, external)).toEqual({
      radarrid: 12,
      language: "de",
      forced: "True",
      hi: "False",
      path: "/movies/Film (2023)/Film.de.forced.srt",
    });
  });
});

describe("buildShiftAction", () => {
  it("splits an offset into Bazarr's components", () => {
    expect(buildShiftAction(1500)).toBe("shift_offset(h=0,m=0,s=1,ms=500)");
    expect(buildShiftAction(3_723_004)).toBe("shift_offset(h=1,m=2,s=3,ms=4)");
  });

  it("negates every non-zero component for an earlier shift", () => {
    expect(buildShiftAction(-61_250)).toBe("shift_offset(h=0,m=-1,s=-1,ms=-250)");
  });

  it("encodes zero", () => {
    expect(buildShiftAction(0)).toBe("shift_offset(h=0,m=0,s=0,ms=0)");
  });
});

describe("buildFpsAction", () => {
  it("formats the conversion", () => {
    expect(buildFpsAction(23.976, 25)).toBe("change_FPS(from=23.976,to=25)");
  });
});

describe("isModifiable / isEmbedded", () => {
  it("allows text tools on external .srt only", () => {
    expect(isModifiable(external)).toBe(true);
    expect(isModifiable({ ...external, path: "/x/Film.de.ass" })).toBe(false);
    expect(isModifiable(embedded)).toBe(false);
  });

  it("detects embedded tracks", () => {
    expect(isEmbedded(embedded)).toBe(true);
    expect(isEmbedded(external)).toBe(false);
  });
});

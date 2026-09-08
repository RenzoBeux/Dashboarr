import {
  autoRows,
  seedMapping,
  qualityFromDefinition,
  qualityLabel,
  radarrImportFiles,
  sonarrImportFiles,
  toRadarrCandidates,
  toSonarrCandidates,
  type ManualImportCandidate,
} from "@/lib/manual-import";
import type { RadarrManualImportItem, SonarrManualImportItem } from "@/lib/types";

const WEBDL = { quality: { id: 3, name: "WEBDL-1080p" } };

function sonarrItem(
  over: Partial<SonarrManualImportItem> = {},
): SonarrManualImportItem {
  return {
    id: 1,
    path: "/downloads/Show.S01E01/show.s01e01.mkv",
    relativePath: "show.s01e01.mkv",
    folderName: "Show.S01E01",
    size: 1000,
    series: { id: 7, title: "Show" },
    seasonNumber: 1,
    episodes: [{ id: 42 }],
    quality: WEBDL,
    languages: [{ id: 1, name: "English" }],
    releaseGroup: "GRP",
    indexerFlags: 0,
    ...over,
  };
}

function radarrItem(
  over: Partial<RadarrManualImportItem> = {},
): RadarrManualImportItem {
  return {
    id: 1,
    path: "/downloads/Movie.2024/movie.2024.mkv",
    relativePath: "movie.2024.mkv",
    folderName: "Movie.2024",
    size: 2000,
    movie: { id: 11, title: "Movie" },
    quality: WEBDL,
    languages: [{ id: 1, name: "English" }],
    indexerFlags: 0,
    ...over,
  };
}

function candidate(
  over: Partial<ManualImportCandidate> = {},
): ManualImportCandidate {
  return {
    id: 1,
    path: "/downloads/Show.S01E01/show.s01e01.mkv",
    folderName: "Show.S01E01",
    name: "show.s01e01.mkv",
    size: 1000,
    mediaId: 7,
    episodeIds: [42],
    quality: WEBDL,
    languages: [{ id: 1, name: "English" }],
    indexerFlags: 0,
    rejections: [],
    ...over,
  };
}

describe("toSonarrCandidates", () => {
  it("normalizes a matched candidate", () => {
    expect(toSonarrCandidates([sonarrItem()])).toEqual([
      expect.objectContaining({
        id: 1,
        name: "show.s01e01.mkv",
        mediaId: 7,
        mediaTitle: "Show",
        seasonNumber: 1,
        episodeIds: [42],
        quality: WEBDL,
      }),
    ]);
  });

  it("keeps an unmatched candidate, with no media and no episodes", () => {
    const [row] = toSonarrCandidates([
      sonarrItem({ series: undefined, episodes: [], seasonNumber: undefined }),
    ]);
    expect(row.mediaId).toBeUndefined();
    expect(row.episodeIds).toEqual([]);
  });

  it("falls back to the path basename when relativePath is absent", () => {
    const [row] = toSonarrCandidates([sonarrItem({ relativePath: undefined })]);
    expect(row.name).toBe("show.s01e01.mkv");
  });

  it("drops a candidate with no path — the command imports by path", () => {
    expect(toSonarrCandidates([sonarrItem({ path: undefined })])).toEqual([]);
  });

  it("dedupes rejection reasons", () => {
    const [row] = toSonarrCandidates([
      sonarrItem({
        rejections: [{ reason: "Not an upgrade" }, { reason: "Not an upgrade" }],
      }),
    ]);
    expect(row.rejections).toEqual(["Not an upgrade"]);
  });

  it("tolerates a missing response", () => {
    expect(toSonarrCandidates(undefined)).toEqual([]);
  });
});

describe("toRadarrCandidates", () => {
  it("normalizes a matched candidate and leaves episodes empty", () => {
    expect(toRadarrCandidates([radarrItem()])).toEqual([
      expect.objectContaining({
        mediaId: 11,
        mediaTitle: "Movie",
        episodeIds: [],
        name: "movie.2024.mkv",
      }),
    ]);
  });

  it("keeps an unmatched candidate", () => {
    const [row] = toRadarrCandidates([radarrItem({ movie: undefined })]);
    expect(row.mediaId).toBeUndefined();
  });
});

describe("autoRows", () => {
  it("takes a fully matched Sonarr candidate", () => {
    expect(autoRows("sonarr", [candidate()])).toEqual([
      { candidate: candidate(), mediaId: 7, quality: WEBDL, episodeIds: [42] },
    ]);
  });

  it("skips a Sonarr candidate with no episode — force import can't map it", () => {
    expect(autoRows("sonarr", [candidate({ episodeIds: [] })])).toEqual([]);
  });

  it("takes a Radarr candidate with no episodes", () => {
    const row = candidate({ episodeIds: [], mediaId: 11 });
    expect(autoRows("radarr", [row])).toHaveLength(1);
  });

  it("skips candidates missing media or quality on either service", () => {
    expect(autoRows("radarr", [candidate({ mediaId: undefined })])).toEqual([]);
    expect(autoRows("sonarr", [candidate({ quality: undefined })])).toEqual([]);
  });
});

describe("seedMapping", () => {
  it("carries over what *arr resolved for the chosen destination", () => {
    expect(seedMapping([candidate()])).toEqual({
      mediaId: 7,
      episodeIds: { 1: [42] },
      included: { 1: true },
    });
  });

  it("drops episode ids belonging to another series", () => {
    // A folder holding two shows: file 2 matched series 9, but the screen
    // imports into series 7, so its episode ids must NOT ride along.
    const seed = seedMapping([
      candidate({ id: 1, mediaId: 7, episodeIds: [42] }),
      candidate({ id: 2, mediaId: 9, episodeIds: [88] }),
    ]);
    expect(seed.mediaId).toBe(7);
    expect(seed.episodeIds).toEqual({ 1: [42] });
    expect(seed.included).toEqual({ 1: true });
  });

  it("selects the largest file when *arr matched nothing", () => {
    const seed = seedMapping([
      candidate({ id: 1, mediaId: undefined, episodeIds: [], size: 100 }),
      candidate({ id: 2, mediaId: undefined, episodeIds: [], size: 900 }),
    ]);
    expect(seed.mediaId).toBeUndefined();
    expect(seed.episodeIds).toEqual({});
    expect(seed.included).toEqual({ 2: true });
  });

  it("leaves an unmatched file out when another file did match", () => {
    const seed = seedMapping([
      candidate({ id: 1, mediaId: 7, episodeIds: [42] }),
      candidate({ id: 2, mediaId: undefined, episodeIds: [] }),
    ]);
    expect(seed.included).toEqual({ 1: true });
  });
});

describe("sonarrImportFiles", () => {
  it("builds the command payload, with the caller's mapping winning", () => {
    const files = sonarrImportFiles(
      [
        {
          candidate: candidate({ episodeIds: [42], releaseType: "singleEpisode" }),
          mediaId: 99,
          quality: WEBDL,
          episodeIds: [500, 501],
        },
      ],
      "abc123",
    );
    expect(files).toEqual([
      {
        path: "/downloads/Show.S01E01/show.s01e01.mkv",
        folderName: "Show.S01E01",
        seriesId: 99,
        episodeIds: [500, 501],
        quality: WEBDL,
        languages: [{ id: 1, name: "English" }],
        releaseGroup: undefined,
        indexerFlags: 0,
        releaseType: "singleEpisode",
        episodeFileId: undefined,
        downloadId: "abc123",
      },
    ]);
  });
});

describe("radarrImportFiles", () => {
  it("builds the command payload without episode fields", () => {
    const files = radarrImportFiles(
      [{ candidate: candidate(), mediaId: 11, quality: WEBDL, episodeIds: [] }],
      "abc123",
    );
    expect(files[0]).toEqual({
      path: "/downloads/Show.S01E01/show.s01e01.mkv",
      folderName: "Show.S01E01",
      movieId: 11,
      quality: WEBDL,
      languages: [{ id: 1, name: "English" }],
      releaseGroup: undefined,
      indexerFlags: 0,
      downloadId: "abc123",
    });
    expect(files[0]).not.toHaveProperty("episodeIds");
  });
});

describe("qualityLabel", () => {
  it("names the quality", () => {
    expect(qualityLabel(WEBDL)).toBe("WEBDL-1080p");
  });

  it("flags repacks and propers", () => {
    expect(qualityLabel({ ...WEBDL, revision: { version: 2, isRepack: true } })).toBe(
      "WEBDL-1080p REPACK",
    );
    expect(qualityLabel({ ...WEBDL, revision: { version: 2 } })).toBe(
      "WEBDL-1080p PROPER",
    );
  });

  it("falls back when *arr parsed nothing", () => {
    expect(qualityLabel(undefined)).toBe("Unknown quality");
  });
});

describe("qualityFromDefinition", () => {
  it("adds the neutral revision the parser would have produced", () => {
    expect(qualityFromDefinition({ id: 3, name: "WEBDL-1080p" })).toEqual({
      quality: { id: 3, name: "WEBDL-1080p" },
      revision: { version: 1, real: 0, isRepack: false },
    });
  });
});

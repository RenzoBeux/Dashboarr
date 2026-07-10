import {
  radarrBarKind,
  radarrIsMissing,
  sonarrBarKind,
  sonarrEpisodeBarKind,
  sonarrBarProgress,
  sonarrIsMissing,
  cornerColorFor,
  downloadIndicator,
  DOWNLOAD_INDICATOR_COLOR,
  BAR_KIND_COLOR,
} from "@/lib/arr-poster-status";
import type { RadarrMovie, SonarrSeries } from "@/lib/types";

function series(over: Partial<SonarrSeries>): SonarrSeries {
  return {
    status: "continuing",
    monitored: true,
    episodeCount: 0,
    episodeFileCount: 0,
    ...over,
  } as SonarrSeries;
}

function movie(over: Partial<RadarrMovie>): RadarrMovie {
  return {
    status: "released",
    monitored: true,
    hasFile: false,
    isAvailable: false,
    ...over,
  } as RadarrMovie;
}

describe("downloadIndicator", () => {
  it("downloading wins over hasFile (issue #207)", () => {
    expect(downloadIndicator(false, true)).toBe("downloading");
    expect(downloadIndicator(true, true)).toBe("downloading");
  });

  it("hasFile and not downloading → downloaded", () => {
    expect(downloadIndicator(true, false)).toBe("downloaded");
  });

  it("neither → pending", () => {
    expect(downloadIndicator(false, false)).toBe("pending");
  });

  it("downloading reuses the exact poster-bar purple", () => {
    // Guards the promise that a single item reads the same color in the grid
    // and on the detail/calendar row.
    expect(DOWNLOAD_INDICATOR_COLOR.downloading).toBe(BAR_KIND_COLOR.purple);
    expect(DOWNLOAD_INDICATOR_COLOR.downloaded).toBe(BAR_KIND_COLOR.success);
  });
});

describe("sonarrEpisodeBarKind", () => {
  const NOW = Date.parse("2026-06-19T00:00:00Z");
  const PAST = "2026-06-01T00:00:00Z";
  const FUTURE = "2026-07-01T00:00:00Z";

  it("downloading wins over everything (issue #207/#217)", () => {
    expect(
      sonarrEpisodeBarKind({ hasFile: false, monitored: true, airDateUtc: PAST }, true, NOW),
    ).toBe("purple");
  });

  it("has file → green", () => {
    expect(
      sonarrEpisodeBarKind({ hasFile: true, monitored: true, airDateUtc: PAST }, false, NOW),
    ).toBe("success");
  });

  it("monitored + aired + missing → red (matches the grid; fixes #217)", () => {
    expect(
      sonarrEpisodeBarKind({ hasFile: false, monitored: true, airDateUtc: PAST }, false, NOW),
    ).toBe("danger");
  });

  it("monitored + not yet aired → blue (upcoming, not alarming)", () => {
    expect(
      sonarrEpisodeBarKind({ hasFile: false, monitored: true, airDateUtc: FUTURE }, false, NOW),
    ).toBe("primary");
  });

  it("unmonitored + missing → gray", () => {
    expect(
      sonarrEpisodeBarKind({ hasFile: false, monitored: false, airDateUtc: PAST }, false, NOW),
    ).toBe("default");
  });

  it("no air date → treated as not aired (blue)", () => {
    expect(
      sonarrEpisodeBarKind({ hasFile: false, monitored: true }, false, NOW),
    ).toBe("primary");
  });
});

describe("sonarrBarKind", () => {
  it("downloading wins over everything", () => {
    expect(
      sonarrBarKind(series({ status: "ended", monitored: false }), true),
    ).toBe("purple");
  });

  it("ended + complete → success", () => {
    expect(
      sonarrBarKind(series({ status: "ended", episodeCount: 10, episodeFileCount: 10 }), false),
    ).toBe("success");
  });

  it("continuing + complete → primary", () => {
    expect(
      sonarrBarKind(
        series({ status: "continuing", episodeCount: 10, episodeFileCount: 10 }),
        false,
      ),
    ).toBe("primary");
  });

  it("missing + monitored → danger", () => {
    expect(
      sonarrBarKind(
        series({ monitored: true, episodeCount: 10, episodeFileCount: 4 }),
        false,
      ),
    ).toBe("danger");
  });

  it("missing + unmonitored → warning", () => {
    expect(
      sonarrBarKind(
        series({ monitored: false, episodeCount: 10, episodeFileCount: 4 }),
        false,
      ),
    ).toBe("warning");
  });

  it("zero episodes counts as complete", () => {
    expect(
      sonarrBarKind(series({ status: "continuing", episodeCount: 0, episodeFileCount: 0 }), false),
    ).toBe("primary");
    expect(
      sonarrBarKind(series({ status: "ended", episodeCount: 0, episodeFileCount: 0 }), false),
    ).toBe("success");
  });

  it("prefers statistics over top-level counts", () => {
    const s = series({
      status: "continuing",
      monitored: true,
      episodeCount: 0,
      episodeFileCount: 0,
      statistics: {
        seasonCount: 1,
        episodeCount: 10,
        episodeFileCount: 3,
        totalEpisodeCount: 10,
        sizeOnDisk: 0,
        percentOfEpisodes: 30,
      },
    });
    expect(sonarrBarKind(s, false)).toBe("danger");
  });
});

describe("sonarrBarProgress", () => {
  it("empty series (no countable episodes) is treated as 100%", () => {
    expect(sonarrBarProgress(series({ episodeCount: 0, episodeFileCount: 0 }))).toBe(100);
  });

  it("aired-but-undownloaded reads 0% — gray track, not a solid bar (issue #171)", () => {
    expect(sonarrBarProgress(series({ episodeCount: 10, episodeFileCount: 0 }))).toBe(0);
  });

  it("partially downloaded reads the percentage", () => {
    expect(sonarrBarProgress(series({ episodeCount: 10, episodeFileCount: 5 }))).toBe(50);
  });

  it("prefers statistics over top-level counts", () => {
    const s = series({
      episodeCount: 0,
      episodeFileCount: 0,
      statistics: {
        seasonCount: 1,
        episodeCount: 8,
        episodeFileCount: 2,
        totalEpisodeCount: 8,
        sizeOnDisk: 0,
        percentOfEpisodes: 25,
      },
    });
    expect(sonarrBarProgress(s)).toBe(25);
  });
});

describe("radarrBarKind", () => {
  it("downloading → purple", () => {
    expect(radarrBarKind(movie({ hasFile: true, monitored: true }), true)).toBe("purple");
  });

  it("downloaded + monitored → success", () => {
    expect(radarrBarKind(movie({ hasFile: true, monitored: true }), false)).toBe("success");
  });

  it("downloaded + unmonitored → default", () => {
    expect(radarrBarKind(movie({ hasFile: true, monitored: false }), false)).toBe("default");
  });

  it("deleted (no file) → inverse", () => {
    expect(
      radarrBarKind(movie({ status: "deleted", hasFile: false, monitored: true }), false),
    ).toBe("inverse");
  });

  it("available + monitored, no file → danger", () => {
    expect(
      radarrBarKind(movie({ isAvailable: true, monitored: true, hasFile: false }), false),
    ).toBe("danger");
  });

  it("unmonitored, no file → warning", () => {
    expect(
      radarrBarKind(movie({ monitored: false, hasFile: false, isAvailable: false }), false),
    ).toBe("warning");
  });

  it("monitored, unreleased, no file → primary", () => {
    expect(
      radarrBarKind(movie({ monitored: true, hasFile: false, isAvailable: false }), false),
    ).toBe("primary");
  });
});

describe("radarrIsMissing", () => {
  it("monitored + available + no file → missing", () => {
    expect(
      radarrIsMissing(movie({ monitored: true, isAvailable: true, hasFile: false })),
    ).toBe(true);
  });

  it("unreleased (not available) → not missing — the point of #265", () => {
    expect(
      radarrIsMissing(movie({ monitored: true, isAvailable: false, hasFile: false })),
    ).toBe(false);
  });

  it("downloaded → not missing", () => {
    expect(
      radarrIsMissing(movie({ monitored: true, isAvailable: true, hasFile: true })),
    ).toBe(false);
  });

  it("unmonitored → not missing", () => {
    expect(
      radarrIsMissing(movie({ monitored: false, isAvailable: true, hasFile: false })),
    ).toBe(false);
  });
});

describe("sonarrIsMissing", () => {
  it("monitored with undownloaded aired episodes → missing", () => {
    expect(
      sonarrIsMissing(series({ monitored: true, episodeCount: 10, episodeFileCount: 4 })),
    ).toBe(true);
  });

  it("fully downloaded → not missing", () => {
    expect(
      sonarrIsMissing(series({ monitored: true, episodeCount: 10, episodeFileCount: 10 })),
    ).toBe(false);
  });

  it("zero countable episodes → treated complete, not missing", () => {
    expect(
      sonarrIsMissing(series({ monitored: true, episodeCount: 0, episodeFileCount: 0 })),
    ).toBe(false);
  });

  it("unmonitored → not missing", () => {
    expect(
      sonarrIsMissing(series({ monitored: false, episodeCount: 10, episodeFileCount: 4 })),
    ).toBe(false);
  });

  it("prefers statistics over top-level counts", () => {
    const s = series({
      monitored: true,
      episodeCount: 0,
      episodeFileCount: 0,
      statistics: {
        seasonCount: 1,
        episodeCount: 10,
        episodeFileCount: 3,
        totalEpisodeCount: 10,
        sizeOnDisk: 0,
        percentOfEpisodes: 30,
      },
    });
    expect(sonarrIsMissing(s)).toBe(true);
  });
});

describe("cornerColorFor", () => {
  it("ended → red", () => {
    expect(cornerColorFor("ended")).toBe("#ef4444");
  });
  it("deleted → gray", () => {
    expect(cornerColorFor("deleted")).toBe("#71717a");
  });
  it("other statuses → null", () => {
    expect(cornerColorFor("continuing")).toBeNull();
    expect(cornerColorFor("released")).toBeNull();
    expect(cornerColorFor("inCinemas")).toBeNull();
  });
});

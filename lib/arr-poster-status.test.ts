import { radarrBarKind, sonarrBarKind, cornerColorFor } from "@/lib/arr-poster-status";
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

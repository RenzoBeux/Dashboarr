jest.mock("@/lib/http-client", () => ({ serviceRequest: jest.fn() }));

import { serviceRequest } from "@/lib/http-client";
import { getDemoResponse } from "@/lib/demo-data";
import {
  detectArrLinks,
  getActiveBazarrJobIds,
  getBazarrLanguageProfiles,
  getBazarrMovie,
  getBazarrSeriesEpisodes,
  getBazarrSeriesItem,
  getBazarrStatus,
  manualSearchSubtitles,
} from "@/services/bazarr-api";
import { buildCoverageGrid, buildSubtitleRows } from "@/lib/subtitle-model";

// Route the service module's requests through the demo fixtures.
beforeEach(() => {
  (serviceRequest as jest.Mock).mockImplementation((serviceId, path, opts) =>
    Promise.resolve(
      getDemoResponse(serviceId, path, opts?.params, opts?.body, opts?.method),
    ),
  );
});

/**
 * Demo mode is a first-class path — it is what store screenshots use and what
 * a user sees before configuring anything. These push the Bazarr fixtures
 * through the real service code, so a drifted fixture cannot make demo mode
 * look right while the live integration breaks.
 */

const demo = (path: string) => getDemoResponse("bazarr", path);

describe("routing", () => {
  it("answers writes with no body, like Bazarr's 204s", () => {
    expect(getDemoResponse("bazarr", "/movies/subtitles", {}, undefined, "PATCH")).toBeUndefined();
    expect(getDemoResponse("bazarr", "/subtitles", {}, undefined, "PATCH")).toBeUndefined();
    expect(getDemoResponse("bazarr", "/providers/movies", {}, undefined, "POST")).toBeUndefined();
  });

  it("answers every path the API module calls", () => {
    for (const path of [
      "/movies/wanted",
      "/episodes/wanted",
      "/movies/history",
      "/episodes/history",
      "/system/status",
      "/system/settings",
    ]) {
      expect(demo(path)).toBeDefined();
    }
  });
});

describe("link detection", () => {
  it("finds nothing, so the demo links pinned in the config stay in charge", async () => {
    // Demo instances have no API keys; a keyless match must never happen.
    const result = await detectArrLinks({
      radarr: [{ id: "r1", localUrl: "http://radarr:7878", remoteUrl: "" }],
      sonarr: [{ id: "s1", apiKey: "", localUrl: "http://sonarr:8989", remoteUrl: "" }],
    });
    expect(result.radarr.instanceId).toBeNull();
    expect(result.sonarr.instanceId).toBeNull();
    expect(result.radarr.address).toBe("radarr:7878");
  });
});

describe("subtitle fixtures", () => {
  it("serves a downloaded demo movie with every chip state between them", async () => {
    const odd = await getBazarrMovie(1);
    const even = await getBazarrMovie(2);
    expect(odd?.radarrId).toBe(1);
    const states = [...buildSubtitleRows(odd!), ...buildSubtitleRows(even!)].map((r) => r.state);
    expect(new Set(states)).toEqual(new Set(["present", "embedded", "missing"]));
    expect(even!.subtitles.some((s) => s.forced)).toBe(true);
  });

  it("lists in Wanted exactly what the movie and episode fixtures miss", async () => {
    const wantedMovies = demo("/movies/wanted") as {
      data: { radarrId: number; missing_subtitles: unknown[] }[];
    };
    expect(wantedMovies.data.length).toBeGreaterThan(0);
    for (const w of wantedMovies.data) {
      expect((await getBazarrMovie(w.radarrId))?.missing_subtitles).toEqual(w.missing_subtitles);
    }
    const wantedEpisodes = demo("/episodes/wanted") as {
      data: { sonarrSeriesId: number; sonarrEpisodeId: number; missing_subtitles: unknown[] }[];
    };
    expect(wantedEpisodes.data.length).toBeGreaterThan(0);
    for (const w of wantedEpisodes.data) {
      const episodes = await getBazarrSeriesEpisodes(w.sonarrSeriesId);
      const ep = episodes.find((e) => e.sonarrEpisodeId === w.sonarrEpisodeId);
      expect(ep?.missing_subtitles).toEqual(w.missing_subtitles);
    }
  });

  it("knows nothing about a movie without a file", async () => {
    await expect(getBazarrMovie(7)).resolves.toBeNull();
  });

  it("serves episodes matching the demo Sonarr series", async () => {
    const episodes = await getBazarrSeriesEpisodes(1);
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes.every((e) => e.sonarrSeriesId === 1)).toBe(true);
    const [profile] = await getBazarrLanguageProfiles();
    const grid = buildCoverageGrid(episodes, profile);
    expect(grid.seasons.some((s) => s.gaps > 0)).toBe(true);
    const item = await getBazarrSeriesItem(1);
    expect(item?.episodeMissingCount).toBe(grid.seasons.reduce((n, s) => n + s.gaps, 0));
  });

  it("reports a version with every feature, an idle queue and manual results", async () => {
    await expect(getBazarrStatus()).resolves.toEqual({ bazarr_version: "1.6.2" });
    await expect(getActiveBazarrJobIds()).resolves.toEqual([]);
    const results = await manualSearchSubtitles({ type: "movie", radarrId: 1 });
    expect(new Set(results.map((r) => r.language))).toEqual(new Set(["de", "en"]));
  });
});

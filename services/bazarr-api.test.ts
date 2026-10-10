jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import {
  detectArrLinks,
  getWantedMovies,
  searchWantedEpisode,
  searchWantedMovie,
} from "@/services/bazarr-api";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(undefined);
});

describe("Bazarr movie routes", () => {
  it("gets the wanted list from the wanted endpoint", async () => {
    await getWantedMovies(10, 25, "inst-1");

    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/movies/wanted", {
      params: { start: 10, length: 25 },
      instanceId: "inst-1",
    });
  });

  it("PATCHes the movie resource when searching for missing subtitles", async () => {
    await searchWantedMovie(42, "inst-1");

    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/movies", {
      method: "PATCH",
      body: JSON.stringify({ radarrid: 42, action: "search-missing" }),
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "inst-1",
    });
  });
});

describe("Bazarr episode routes", () => {
  // /episodes/wanted is GET-only (405 on PATCH, verified on Bazarr 1.6.2).
  // An episode search is a PATCH on /episodes/subtitles, one per missing language.
  it("PATCHes /episodes/subtitles once per missing language", async () => {
    await searchWantedEpisode(
      17,
      939,
      [
        { name: "English", code2: "en", code3: "eng", hi: false, forced: false },
        { name: "French", code2: "fr", code3: "fra", hi: true, forced: false },
      ],
      "inst-1",
    );

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenNthCalledWith(1, "bazarr", "/episodes/subtitles", {
      method: "PATCH",
      params: { seriesid: 17, episodeid: 939, language: "en", forced: "False", hi: "False" },
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "inst-1",
    });
    expect(mockRequest).toHaveBeenNthCalledWith(2, "bazarr", "/episodes/subtitles", {
      method: "PATCH",
      params: { seriesid: 17, episodeid: 939, language: "fr", forced: "False", hi: "True" },
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "inst-1",
    });
  });

  it("never touches the GET-only wanted route", async () => {
    await searchWantedEpisode(
      17,
      939,
      [{ name: "English", code2: "en", code3: "eng", hi: false, forced: true }],
    );

    for (const call of mockRequest.mock.calls) {
      expect(call[1]).not.toBe("/episodes/wanted");
    }
  });

  const twoLanguages = [
    { name: "English", code2: "en", code3: "eng", hi: false, forced: false },
    { name: "French", code2: "fr", code3: "fra", hi: false, forced: false },
  ];

  it("sends every language without waiting on the previous one", async () => {
    // Pre-1.5.6 Bazarr holds the response until the search finishes.
    mockRequest.mockReturnValue(new Promise(() => {}));

    void searchWantedEpisode(17, 939, twoLanguages);

    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("succeeds when at least one language was sent", async () => {
    mockRequest
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(undefined);

    await expect(searchWantedEpisode(17, 939, twoLanguages)).resolves.toBeUndefined();
  });

  it("throws only when every language failed", async () => {
    const err = new Error("boom");
    mockRequest.mockRejectedValue(err);

    await expect(searchWantedEpisode(17, 939, twoLanguages)).rejects.toBe(err);
  });
});

describe("detectArrLinks", () => {
  const settings = {
    general: { use_radarr: true, use_sonarr: false },
    radarr: { ip: "radarr", port: 7878, apikey: "radarr-key-2" },
    sonarr: { ip: "sonarr", port: 8989, apikey: "sonarr-key" },
    opensubtitlescom: { username: "me", password: "provider-secret" },
    auth: { apikey: "bazarr-own-key" },
  };
  const candidates = {
    radarr: [
      { id: "r1", apiKey: "radarr-key-1", localUrl: "http://radarr:7878", remoteUrl: "" },
      { id: "r2", apiKey: "radarr-key-2", localUrl: "http://radarr2:7878", remoteUrl: "" },
    ],
    sonarr: [{ id: "s1", apiKey: "sonarr-key", localUrl: "http://sonarr:8989", remoteUrl: "" }],
  };

  it("matches by API key and skips an arr Bazarr has switched off", async () => {
    mockRequest.mockResolvedValue(settings);
    const result = await detectArrLinks(candidates, "bz-1");

    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/system/settings", {
      instanceId: "bz-1",
    });
    expect(result).toEqual({
      radarr: { instanceId: "r2", address: "radarr:7878" },
      sonarr: { instanceId: null, address: null },
    });
  });

  it("returns ids and addresses only, never the settings' secrets", async () => {
    mockRequest.mockResolvedValue(settings);
    const serialized = JSON.stringify(await detectArrLinks(candidates, "bz-1"));

    for (const secret of ["radarr-key-2", "sonarr-key", "provider-secret", "bazarr-own-key"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("tolerates a malformed settings payload", async () => {
    mockRequest.mockResolvedValue("not settings");
    await expect(detectArrLinks(candidates)).resolves.toEqual({
      radarr: { instanceId: null, address: null },
      sonarr: { instanceId: null, address: null },
    });
  });
});

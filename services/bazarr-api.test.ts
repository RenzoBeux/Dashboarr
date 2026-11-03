jest.mock("@/lib/http-client", () => {
  class HttpError extends Error {
    status: number;
    constructor(code: number) {
      super(`HTTP ${code}`);
      this.status = code;
    }
  }
  class AuthProxyResponseError extends HttpError {}
  return { serviceRequest: jest.fn(), HttpError, AuthProxyResponseError };
});

import { AuthProxyResponseError, HttpError, serviceRequest } from "@/lib/http-client";
import {
  BAZARR_MANUAL_SEARCH_TIMEOUT,
  INTERACTIVE_SEARCH_TIMEOUT,
} from "@/lib/constants";
import {
  deleteSubtitle,
  detectArrLinks,
  downloadSubtitleResult,
  getActiveBazarrJobIds,
  getBazarrMovie,
  getBazarrSeriesEpisodes,
  manualSearchSubtitles,
  runSubtitleTool,
  searchMissingSubtitles,
  searchSubtitle,
  searchSubtitles,
  setLanguageProfile,
  uploadSubtitle,
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

describe("subtitle items", () => {
  it("reads one movie by its Radarr id", async () => {
    mockRequest.mockResolvedValue({ data: [{ radarrId: 5, title: "Film" }] });
    await expect(getBazarrMovie(5, "bz")).resolves.toEqual({ radarrId: 5, title: "Film" });
    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/movies", {
      params: { "radarrid[]": 5 },
      instanceId: "bz",
    });
  });

  it("is null for a movie Bazarr doesn't know", async () => {
    mockRequest.mockResolvedValue({ data: [] });
    await expect(getBazarrMovie(5)).resolves.toBeNull();
  });

  it("lists a series' episodes", async () => {
    mockRequest.mockResolvedValue({ data: [{ sonarrEpisodeId: 1 }] });
    await expect(getBazarrSeriesEpisodes(9, "bz")).resolves.toEqual([{ sonarrEpisodeId: 1 }]);
    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/episodes", {
      params: { "seriesid[]": 9 },
      instanceId: "bz",
    });
  });
});

describe("subtitle actions", () => {
  const movie = { type: "movie" as const, radarrId: 12 };
  const episode = { type: "episode" as const, seriesId: 3, episodeId: 99 };
  const sub = {
    name: "German",
    code2: "de",
    code3: "ger",
    path: "/m/Film.de.srt",
    forced: false,
    hi: false,
  };

  it("searches one language on the item's subtitles route", async () => {
    await searchSubtitle(episode, { code2: "fr", forced: true, hi: false }, "bz");
    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/episodes/subtitles", {
      method: "PATCH",
      params: { seriesid: 3, episodeid: 99, language: "fr", forced: "True", hi: "False" },
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "bz",
    });
  });

  it("searches a whole series' missing subtitles on the series resource", async () => {
    await searchMissingSubtitles({ type: "series", seriesId: 3 }, "bz");
    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/series", {
      method: "PATCH",
      body: JSON.stringify({ seriesid: 3, action: "search-missing" }),
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "bz",
    });
  });

  it("uploads multipart with lowercase booleans and the file", async () => {
    await uploadSubtitle(
      movie,
      { uri: "file:///cache/Film.de.srt", name: "Film.de.srt" },
      { code2: "de", forced: true, hi: false },
      "bz",
    );
    const [, path, opts] = mockRequest.mock.calls[0];
    expect(path).toBe("/movies/subtitles");
    expect(opts.method).toBe("POST");
    const form = opts.body as FormData;
    expect(form.get("radarrid")).toBe("12");
    expect(form.get("forced")).toBe("true");
    expect(form.get("hi")).toBe("false");
    expect(form.get("language")).toBe("de");
    expect(form.get("file")).toBeTruthy();
  });

  it("deletes a file by its path", async () => {
    await deleteSubtitle(movie, sub, "bz");
    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/movies/subtitles", {
      method: "DELETE",
      params: { radarrid: 12, language: "de", forced: "False", hi: "False", path: "/m/Film.de.srt" },
      instanceId: "bz",
    });
  });

  it("runs manual search with the abort signal and a long timeout", async () => {
    const signal = new AbortController().signal;
    mockRequest.mockResolvedValue({ data: [{ provider: "p" }] });
    await expect(manualSearchSubtitles(episode, "bz", signal)).resolves.toEqual([{ provider: "p" }]);
    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/providers/episodes", {
      params: { seriesid: 3, episodeid: 99 },
      timeout: BAZARR_MANUAL_SEARCH_TIMEOUT,
      signal,
      instanceId: "bz",
    });
  });

  it("downloads a manual result by echoing its fields", async () => {
    await downloadSubtitleResult(
      movie,
      { provider: "p", subtitle: "tok", forced: "False", hearing_impaired: "True" },
      "bz",
    );
    expect(mockRequest.mock.calls[0][2].params).toBeUndefined();
    expect(JSON.parse(mockRequest.mock.calls[0][2].body)).toEqual({
      radarrid: 12,
      provider: "p",
      subtitle: "tok",
      hi: "True",
      forced: "False",
      original_format: "False",
    });
  });

  it("runs tools on /subtitles", async () => {
    await runSubtitleTool(movie, sub, { kind: "mod", mod: "common" }, "bz");
    expect(mockRequest.mock.calls[0][1]).toBe("/subtitles");
    expect(mockRequest.mock.calls[0][2]).toMatchObject({
      method: "PATCH",
      params: { action: "common", path: "/m/Film.de.srt", type: "movie", id: 12 },
    });
  });

  it('clears a language profile with "" (Bazarr 404s on "none")', async () => {
    await setLanguageProfile({ type: "movie", radarrId: 12 }, null, "bz");
    expect(mockRequest).toHaveBeenCalledWith("bazarr", "/movies", {
      method: "POST",
      params: { radarrid: 12, profileid: "" },
      instanceId: "bz",
    });
    await setLanguageProfile({ type: "series", seriesId: 3 }, 2);
    expect(mockRequest.mock.calls[1][2].params).toEqual({ seriesid: 3, profileid: 2 });
  });
});

describe("getActiveBazarrJobIds", () => {
  it("merges pending and running jobs", async () => {
    mockRequest
      .mockResolvedValueOnce({ data: [{ job_id: 1 }] })
      .mockResolvedValueOnce({ data: [{ job_id: 2 }] });
    await expect(getActiveBazarrJobIds("bz")).resolves.toEqual([1, 2]);
  });

  it("is null when the job queue doesn't exist", async () => {
    mockRequest.mockRejectedValue(new (HttpError as unknown as new (s: number) => Error)(404));
    await expect(getActiveBazarrJobIds("bz")).resolves.toBeNull();
  });

  it("is null when an old Bazarr answers with its web UI", async () => {
    mockRequest.mockRejectedValue(
      new (AuthProxyResponseError as unknown as new (s: number) => Error)(200),
    );
    await expect(getActiveBazarrJobIds("bz")).resolves.toBeNull();
  });

  it("rethrows other failures", async () => {
    mockRequest.mockRejectedValue(new (HttpError as unknown as new (s: number) => Error)(500));
    await expect(getActiveBazarrJobIds("bz")).rejects.toThrow();
  });
});

describe("searchSubtitles", () => {
  const ep = (episodeId: number) => ({
    target: { type: "episode" as const, seriesId: 1, episodeId },
    lang: { code2: "de", forced: false, hi: false },
  });

  it("succeeds when only some searches fail", async () => {
    mockRequest.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(undefined);
    await expect(searchSubtitles([ep(1), ep(2)])).resolves.toBeUndefined();
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("fails when every search fails", async () => {
    mockRequest.mockRejectedValue(new Error("down"));
    await expect(searchSubtitles([ep(1), ep(2)])).rejects.toThrow("down");
  });

  it("keeps at most 4 searches open at once, starting the next as one ends", async () => {
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    const pending: (() => void)[] = [];
    mockRequest.mockImplementation(() => new Promise<void>((resolve) => pending.push(resolve)));
    const done = searchSubtitles([1, 2, 3, 4, 5, 6].map(ep));
    expect(mockRequest).toHaveBeenCalledTimes(4);
    pending[0]();
    await flush();
    expect(mockRequest).toHaveBeenCalledTimes(5);
    pending[1]();
    await flush();
    expect(mockRequest).toHaveBeenCalledTimes(6);
    pending.slice(2).forEach((resolve) => resolve());
    await expect(done).resolves.toBeUndefined();
  });
});

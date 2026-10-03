jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import {
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
      instanceId: "inst-1",
    });
    expect(mockRequest).toHaveBeenNthCalledWith(2, "bazarr", "/episodes/subtitles", {
      method: "PATCH",
      params: { seriesid: 17, episodeid: 939, language: "fr", forced: "False", hi: "True" },
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
});

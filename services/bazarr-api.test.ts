jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import { getWantedMovies, searchWantedMovie } from "@/services/bazarr-api";

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

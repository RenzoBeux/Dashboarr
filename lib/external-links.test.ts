import { imdbTitleUrl, tmdbMovieUrl } from "./external-links";

describe("imdbTitleUrl", () => {
  it("builds the title page URL", () => {
    expect(imdbTitleUrl("tt1448755")).toBe(
      "https://www.imdb.com/title/tt1448755",
    );
  });

  it("returns undefined for a missing or empty id", () => {
    expect(imdbTitleUrl("")).toBeUndefined();
    expect(imdbTitleUrl(undefined)).toBeUndefined();
    expect(imdbTitleUrl(null)).toBeUndefined();
  });
});

describe("tmdbMovieUrl", () => {
  it("builds the movie page URL", () => {
    expect(tmdbMovieUrl(49530)).toBe("https://www.themoviedb.org/movie/49530");
  });

  it("returns undefined for a missing or zero id", () => {
    expect(tmdbMovieUrl(0)).toBeUndefined();
    expect(tmdbMovieUrl(undefined)).toBeUndefined();
  });
});

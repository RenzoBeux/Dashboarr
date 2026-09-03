import { isSeasonPremiere } from "./season-premiere";

describe("isSeasonPremiere", () => {
  it("accepts the first episode of any numbered season", () => {
    expect(isSeasonPremiere({ seasonNumber: 1, episodeNumber: 1 })).toBe(true);
    expect(isSeasonPremiere({ seasonNumber: 2, episodeNumber: 1 })).toBe(true);
    expect(isSeasonPremiere({ seasonNumber: 10, episodeNumber: 1 })).toBe(true);
  });

  it("rejects every episode after the first", () => {
    expect(isSeasonPremiere({ seasonNumber: 4, episodeNumber: 2 })).toBe(false);
    expect(isSeasonPremiere({ seasonNumber: 1, episodeNumber: 13 })).toBe(false);
  });

  // Specials are one running list across the whole series, so an S00E01 is an
  // extra. A real library returns entries as high as S00E51, which is what
  // makes the bare `episodeNumber === 1` check wrong.
  it("never treats a special as a premiere", () => {
    expect(isSeasonPremiere({ seasonNumber: 0, episodeNumber: 1 })).toBe(false);
    expect(isSeasonPremiere({ seasonNumber: 0, episodeNumber: 50 })).toBe(false);
  });
});

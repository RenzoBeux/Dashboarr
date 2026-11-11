import { isHttpUrl, toApiMediaCoverPath } from "./service-image-url";

describe("isHttpUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(isHttpUrl("https://images.lidarr.audio/cache/x.jpg")).toBe(true);
    expect(isHttpUrl("HTTP://host/x.jpg")).toBe(true);
  });

  it("rejects disk paths, relative paths and empties (#511)", () => {
    expect(isHttpUrl("/config/MediaCover/3/poster.jpg")).toBe(false);
    expect(isHttpUrl("/MediaCover/3/poster.jpg")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});

describe("toApiMediaCoverPath", () => {
  it("keeps the Radarr/Sonarr id route", () => {
    expect(
      toApiMediaCoverPath("/MediaCover/12/poster.jpg?lastWrite=1", "radarr", "/api/v3"),
    ).toBe("/api/v3/MediaCover/12/poster-500.jpg?lastWrite=1");
    expect(toApiMediaCoverPath("/MediaCover/7/fanart.jpg", "sonarr", "/api/v3")).toBe(
      "/api/v3/MediaCover/7/fanart-500.jpg",
    );
  });

  it("maps Lidarr artist images to the artist route (#511)", () => {
    expect(
      toApiMediaCoverPath(
        "/MediaCover/3/poster.jpg?lastWrite=639268888151888846",
        "lidarr",
        "/api/v1",
      ),
    ).toBe("/api/v1/MediaCover/artist/3/poster-500.jpg?lastWrite=639268888151888846");
  });

  it("maps Lidarr album images to the album route", () => {
    expect(
      toApiMediaCoverPath("/MediaCover/Albums/42/cover.jpg?lastWrite=5", "lidarr", "/api/v1"),
    ).toBe("/api/v1/MediaCover/album/42/cover-500.jpg?lastWrite=5");
  });

  it("leaves non-MediaCover paths alone", () => {
    expect(toApiMediaCoverPath("/api/v1/images/x.jpg", "lidarr", "/api/v1")).toBe(
      "/api/v1/images/x.jpg",
    );
  });
});

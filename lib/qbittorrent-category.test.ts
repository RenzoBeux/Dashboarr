import { isValidQbCategoryName } from "@/lib/qbittorrent-category";

describe("isValidQbCategoryName", () => {
  it.each(["Dashboarr", "Dashboarr-Movie", "tv-sonarr", "a", "movies/4k", "a/b/c", "with space"])(
    "accepts %j",
    (name) => {
      expect(isValidQbCategoryName(name)).toBe(true);
    },
  );

  it.each(["", "\\", "a\\b", "/a", "a/", "/", "a//b", "//"])("rejects %j", (name) => {
    expect(isValidQbCategoryName(name)).toBe(false);
  });
});

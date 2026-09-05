// Tests live here rather than next to app/+native-intent.ts — files inside
// app/ are treated as expo-router routes.
import { redirectSystemPath } from "../app/+native-intent";

describe("redirectSystemPath", () => {
  it("rewrites magnet URIs to the downloads route with the URI encoded", () => {
    const magnet = "magnet:?xt=urn:btih:abc123&dn=Some+Name&tr=udp://tracker";
    expect(redirectSystemPath({ path: magnet, initial: true })).toBe(
      `/downloads?magnet=${encodeURIComponent(magnet)}`,
    );
  });

  it("round-trips the magnet URI through URL decoding intact", () => {
    const magnet = "magnet:?xt=urn:btih:abc123&dn=Some%20Name&tr=udp://tracker";
    const result = redirectSystemPath({ path: magnet, initial: false });
    const param = new URLSearchParams(result.split("?")[1]).get("magnet");
    expect(param).toBe(magnet);
  });

  it("passes non-magnet paths through unchanged", () => {
    expect(redirectSystemPath({ path: "/settings", initial: false })).toBe("/settings");
    expect(
      redirectSystemPath({ path: "dashboarr://downloads?client=rtorrent", initial: true }),
    ).toBe("dashboarr://downloads?client=rtorrent");
    expect(
      redirectSystemPath({ path: "dashboarr://downloads?client=deluge", initial: true }),
    ).toBe("dashboarr://downloads?client=deluge");
    expect(redirectSystemPath({ path: "dashboarr:///calendar", initial: true })).toBe(
      "dashboarr:///calendar",
    );
  });

  // Series/movie details live inside several tab stacks (#330); an OS link
  // has no tab context, so it is pinned to the always-present Dashboard stack.
  // The Android calendar widget bakes these links in as `scheme:///path`.
  describe("content deep links land in the Dashboard stack", () => {
    it.each([
      ["/series/42?instanceId=s1", "/(tabs)/(dashboard)/series/42?instanceId=s1"],
      ["dashboarr:///series/42?instanceId=s1", "/(tabs)/(dashboard)/series/42?instanceId=s1"],
      ["dashboarr://movie/7", "/(tabs)/(dashboard)/movie/7"],
      ["dashboarr-dev:///movie/7?instanceId=x", "/(tabs)/(dashboard)/movie/7?instanceId=x"],
    ])("%s -> %s", (path, expected) => {
      expect(redirectSystemPath({ path, initial: true })).toBe(expected);
      expect(redirectSystemPath({ path, initial: false })).toBe(expected);
    });

    it("leaves an already qualified path alone", () => {
      const qualified = "/(tabs)/(dashboard)/series/1";
      expect(redirectSystemPath({ path: qualified, initial: true })).toBe(qualified);
    });

    it("only matches the series and movie families", () => {
      expect(redirectSystemPath({ path: "/series-search", initial: true })).toBe(
        "/series-search",
      );
      expect(redirectSystemPath({ path: "dashboarr:///movies", initial: true })).toBe(
        "dashboarr:///movies",
      );
    });
  });
});

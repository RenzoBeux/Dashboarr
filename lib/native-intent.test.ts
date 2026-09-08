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

  // Detail screens live inside several tab stacks (#330); an OS link has no
  // tab context, so it is pinned to the always-present Dashboard stack. The
  // Android calendar widget bakes these links in as `scheme:///path`.
  // lib/tab-route-resolution.test.ts proves the resulting hrefs really land
  // there against the actual route tree.
  describe("shared-stack deep links land in the Dashboard stack", () => {
    it.each([
      ["/series/42?instanceId=s1", "/(tabs)/(dashboard)/series/42?instanceId=s1"],
      ["dashboarr:///series/42?instanceId=s1", "/(tabs)/(dashboard)/series/42?instanceId=s1"],
      ["dashboarr://movie/7", "/(tabs)/(dashboard)/movie/7"],
      ["dashboarr-dev:///movie/7?instanceId=x", "/(tabs)/(dashboard)/movie/7?instanceId=x"],
      ["/series/releases/42", "/(tabs)/(dashboard)/series/releases/42"],
      ["/movie/search", "/(tabs)/(dashboard)/movie/search"],
      ["/album/9", "/(tabs)/(dashboard)/album/9"],
      ["/artist/search", "/(tabs)/(dashboard)/artist/search"],
      ["/author/4", "/(tabs)/(dashboard)/author/4"],
      ["/book/5", "/(tabs)/(dashboard)/book/5"],
      ["/torrent/abc?instanceId=q1", "/(tabs)/(dashboard)/torrent/abc?instanceId=q1"],
      ["dashboarr://transmission/abc", "/(tabs)/(dashboard)/transmission/abc"],
      ["/deluge/abc", "/(tabs)/(dashboard)/deluge/abc"],
      ["/sab/SABnzbd_nzo_x", "/(tabs)/(dashboard)/sab/SABnzbd_nzo_x"],
      ["/nzb/12", "/(tabs)/(dashboard)/nzb/12"],
    ])("%s -> %s", (path, expected) => {
      expect(redirectSystemPath({ path, initial: true })).toBe(expected);
      expect(redirectSystemPath({ path, initial: false })).toBe(expected);
    });

    it("leaves an already qualified path alone", () => {
      const qualified = "/(tabs)/(dashboard)/series/1";
      expect(redirectSystemPath({ path: qualified, initial: true })).toBe(qualified);
    });

    it("needs a second segment, so tab roots and near-misses pass through", () => {
      for (const path of [
        "/series-search",
        "dashboarr:///movies",
        "dashboarr:///books",
        "/music",
        "/movie",
        "/torrentx/1",
        "/albums/1",
      ]) {
        expect(redirectSystemPath({ path, initial: true })).toBe(path);
      }
    });

    // The (dashboard,services,settings) screens are shared too, but they
    // already resolve into the Dashboard stack with no tab context — pinning
    // them would drag an OS link out of the Settings stack the user is in.
    it("leaves the settings and services screens unpinned", () => {
      for (const path of [
        "/settings",
        "/settings/network",
        "/settings/integrations/radarr/i1",
        "/wake-on-lan",
        "/backend",
        "/custom-headers",
        "/home-networks",
      ]) {
        expect(redirectSystemPath({ path, initial: true })).toBe(path);
      }
    });
  });
});

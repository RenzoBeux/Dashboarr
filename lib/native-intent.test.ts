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
  });
});

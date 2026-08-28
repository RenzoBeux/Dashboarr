// getDemoResponse is pure, but the normalizers under test sit next to modules
// that import http-client -> config-store -> AsyncStorage. Stub the chain.
jest.mock("@/lib/http-client", () => ({ serviceRequest: jest.fn() }));
jest.mock("@/store/config-store", () => ({
  useConfigStore: Object.assign(() => undefined, {
    getState: () => ({ getActiveInstanceId: () => null, instanceSecrets: {} }),
  }),
}));

import { getDemoResponse } from "@/lib/demo-data";
import {
  scanStatusToSummary,
  summarizeLibraries,
  unwrapSubsonic,
  type NavidromeLibrary,
  type NavidromeScanStatus,
} from "@/lib/navidrome-normalize";
import type {
  NavidromeAlbum,
  NavidromeArtistsResult,
  NavidromeLoginResponse,
  NavidromeNowPlayingEntry,
  NavidromePlaylist,
  NavidromeSearchResult,
  NavidromeUser,
} from "@/lib/types";

// Demo mode is the only place outside these unit tests where a Navidrome
// payload is produced without a server, so the fixtures are pushed through the
// REAL parsers here — a fixture that drifts from the wire shape fails loudly
// instead of quietly rendering an empty screen in the demo.
function demo(path: string, params?: Record<string, string | number | boolean>) {
  return getDemoResponse("navidrome", path, params);
}

describe("Navidrome demo fixtures", () => {
  it("wraps every /rest payload in a real subsonic-response envelope", () => {
    for (const path of [
      "/rest/ping",
      "/rest/getScanStatus",
      "/rest/getUser",
      "/rest/getNowPlaying",
      "/rest/getArtists",
      "/rest/getAlbumList2",
      "/rest/getPlaylists",
    ]) {
      expect(demo(path)).toHaveProperty(["subsonic-response", "status"], "ok");
    }
  });

  it("survives unwrapSubsonic for scan status, and summarises", () => {
    const status = unwrapSubsonic<NavidromeScanStatus>(demo("/rest/getScanStatus"), "scanStatus");
    expect(status.count).toBeGreaterThan(0);
    expect(status.folderCount).toBeGreaterThan(0);
    const summary = scanStatusToSummary(status);
    expect(summary.source).toBe("scanStatus");
    expect(summary.songs).toBe(status.count);
    expect(summary.lastScanAt).not.toBeNull();
  });

  it("feeds summarizeLibraries a native /api/library row with a real byte size", () => {
    const libraries = demo("/api/library") as NavidromeLibrary[];
    expect(libraries).toHaveLength(1);
    const summary = summarizeLibraries(libraries);
    expect(summary.source).toBe("library");
    expect(summary.sizeBytes).toBeGreaterThan(1_000_000_000);
    expect(summary.artists).toBeGreaterThan(0);
    expect(summary.albums).toBeGreaterThan(0);
    expect(summary.missing).toBeGreaterThan(0);
    expect(summary.lastScanAt).not.toBeNull();
  });

  it("keeps the library row and the scan status telling the same story", () => {
    const libraries = demo("/api/library") as NavidromeLibrary[];
    const status = unwrapSubsonic<NavidromeScanStatus>(demo("/rest/getScanStatus"), "scanStatus");
    expect(libraries[0]!.totalSongs).toBe(status.count);
    expect(libraries[0]!.totalFolders).toBe(status.folderCount);
  });

  it("reports an admin user, so the demo shows the maintenance actions", () => {
    const user = unwrapSubsonic<NavidromeUser>(demo("/rest/getUser"), "user");
    expect(user.adminRole).toBe(true);
    const login = demo("/auth/login") as NavidromeLoginResponse;
    expect(login.isAdmin).toBe(true);
    expect(login.token).toBeTruthy();
  });

  it("returns now-playing entries with the Navidrome extensions the row reads", () => {
    const nowPlaying = unwrapSubsonic<{ entry: NavidromeNowPlayingEntry[] }>(
      demo("/rest/getNowPlaying"),
      "nowPlaying",
    );
    expect(nowPlaying.entry.length).toBeGreaterThan(0);
    for (const entry of nowPlaying.entry) {
      expect(typeof entry.positionMs).toBe("number");
      expect(typeof entry.duration).toBe("number");
      expect(entry.playerId).toBeDefined();
      expect(entry.username).toBeTruthy();
    }
    // One paused and one playing, so both badge states are exercised in demo.
    expect(nowPlaying.entry.map((e) => e.state)).toEqual(
      expect.arrayContaining(["playing", "paused"]),
    );
  });

  it("sums the artist index the way getArtistCounts does", () => {
    const artists = unwrapSubsonic<NavidromeArtistsResult>(demo("/rest/getArtists"), "artists");
    const total = (artists.index ?? []).flatMap((i) => i.artist ?? []);
    expect(total.length).toBeGreaterThan(1);
    expect(total.every((a) => (a.albumCount ?? 0) > 0)).toBe(true);
  });

  it("returns albums with the coverArt id the tiles need", () => {
    const list = unwrapSubsonic<{ album: NavidromeAlbum[] }>(
      demo("/rest/getAlbumList2"),
      "albumList2",
    );
    expect(list.album.length).toBeGreaterThan(0);
    expect(list.album.every((a) => !!a.coverArt && !!a.artist)).toBe(true);
  });

  it("returns a playlist with its tracks embedded", () => {
    const playlists = unwrapSubsonic<{ playlist: NavidromePlaylist[] }>(
      demo("/rest/getPlaylists"),
      "playlists",
    );
    expect(playlists.playlist.length).toBeGreaterThan(0);

    const one = unwrapSubsonic<NavidromePlaylist>(
      demo("/rest/getPlaylist", { id: "pl-2" }),
      "playlist",
    );
    expect(one.id).toBe("pl-2");
    expect(one.entry?.length).toBeGreaterThan(0);
  });

  it("filters search3, and can return nothing so the empty state is reachable", () => {
    const hit = unwrapSubsonic<NavidromeSearchResult>(
      demo("/rest/search3", { query: "burial" }),
      "searchResult3",
    );
    expect(hit.artist?.[0]?.name).toBe("Burial");
    expect(hit.album?.[0]?.name).toBe("Untrue");

    const miss = unwrapSubsonic<NavidromeSearchResult>(
      demo("/rest/search3", { query: "zzzzzz" }),
      "searchResult3",
    );
    expect(miss.artist).toBeUndefined();
    expect(miss.album).toBeUndefined();
    expect(miss.song).toBeUndefined();
  });

  it("does not answer paths it has no fixture for", () => {
    expect(demo("/rest/getGenres")).toBeUndefined();
    expect(demo("/api/song")).toBeUndefined();
  });
});

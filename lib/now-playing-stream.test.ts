// The mappers transitively import the config store (via the image-URL helpers
// in services/*-api.ts), which loads AsyncStorage/SecureStore — native modules
// absent in the jest-expo node env. Shim them; the mappers under test only read
// pure session fields (poster URLs resolve to null without a configured store).
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import {
  plexSessionToStream,
  mediaServerSessionToStream,
  navidromeNowPlayingToStream,
  formatEpisodeStreamTitle,
  isLocalEndpoint,
  parseHiddenUsers,
} from "./now-playing-stream";
import type {
  JellyfinSession,
  NavidromeNowPlayingEntry,
  PlexSession,
} from "./types";

describe("formatEpisodeStreamTitle", () => {
  it("builds the 3-part title from numeric indices", () => {
    expect(formatEpisodeStreamTitle("Fallout", 1, 5, "The Big Door Prize")).toBe(
      "Fallout — S01E05 — The Big Door Prize",
    );
  });

  it("coerces Tautulli's string indices", () => {
    expect(formatEpisodeStreamTitle("Fallout", "1", "5", "The Big Door Prize")).toBe(
      "Fallout — S01E05 — The Big Door Prize",
    );
  });

  it("keeps season 0 (specials)", () => {
    expect(formatEpisodeStreamTitle("Show", 0, 3, "Special")).toBe("Show — S00E03 — Special");
  });

  it("drops the code when either index is missing, blank, or NaN", () => {
    expect(formatEpisodeStreamTitle("Show", undefined, 5, "Ep")).toBe("Show — Ep");
    expect(formatEpisodeStreamTitle("Show", "", "", "Ep")).toBe("Show — Ep");
    expect(formatEpisodeStreamTitle("Show", "abc", 5, "Ep")).toBe("Show — Ep");
  });

  it("falls back to Unknown when everything is missing", () => {
    expect(formatEpisodeStreamTitle(undefined, null, null, undefined)).toBe("Unknown");
  });
});

describe("plexSessionToStream", () => {
  it("maps a paused, transcoding episode", () => {
    const session = {
      sessionKey: "s1",
      ratingKey: "r1",
      type: "episode",
      title: "The End",
      grandparentTitle: "Fallout",
      thumb: "/t",
      grandparentThumb: "/gt",
      duration: 1000,
      viewOffset: 500,
      Player: { title: "Living Room", platform: "tvOS", state: "paused", local: true, address: "10.0.0.5" },
      Session: { id: "sid", bandwidth: 100, location: "lan" },
      TranscodeSession: { videoDecision: "transcode", audioDecision: "direct play", progress: 0, speed: 1 },
      User: { id: 1, title: "alice" },
    } as PlexSession;

    const s = plexSessionToStream(session, "inst-1");
    expect(s.serviceId).toBe("plex");
    expect(s.title).toBe("Fallout — The End");
    expect(s.state).toBe("paused");
    expect(s.transcoding).toBe(true);
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.isLocal).toBe(true);
    expect(s.user).toBe("alice");
    expect(s.device).toBe("Living Room");
    expect(s.mediaType).toBe("tv");
  });

  it("maps a playing, direct-play movie and guards zero duration", () => {
    const session = {
      sessionKey: "s2",
      ratingKey: "r2",
      type: "movie",
      title: "Dune",
      duration: 0,
      viewOffset: 0,
      Player: { title: "Chrome", platform: "web", state: "playing", local: false, address: "8.8.8.8" },
      Session: { id: "sid2", bandwidth: 100, location: "wan" },
      User: { id: 2, title: "bob" },
    } as PlexSession;

    const s = plexSessionToStream(session, "inst-1");
    expect(s.state).toBe("playing");
    expect(s.transcoding).toBe(false);
    expect(s.progress).toBe(0);
    expect(s.isLocal).toBe(false);
    expect(s.mediaType).toBe("movie");
  });
});

describe("mediaServerSessionToStream", () => {
  it("maps a paused, transcoding, remote Jellyfin episode (ticks → progress)", () => {
    const session = {
      Id: "j1",
      UserName: "carol",
      Client: "Jellyfin Web",
      DeviceName: "TV",
      RemoteEndPoint: "8.8.8.8",
      NowPlayingItem: {
        Id: "i1",
        Name: "Pilot",
        Type: "Episode",
        SeriesName: "Series",
        ParentIndexNumber: 1,
        IndexNumber: 1,
        RunTimeTicks: 600_000_000, // 60s
        ImageTags: {},
      },
      PlayState: { PositionTicks: 300_000_000, IsPaused: true, PlayMethod: "Transcode" }, // 30s
    } as JellyfinSession;

    const s = mediaServerSessionToStream(session, "inst-1", "jellyfin");
    expect(s.serviceId).toBe("jellyfin");
    expect(s.title).toBe("Series — S01E01 — Pilot");
    expect(s.state).toBe("paused");
    expect(s.transcoding).toBe(true);
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.isLocal).toBe(false);
    expect(s.user).toBe("carol");
    expect(s.mediaType).toBe("tv");
  });

  it("maps a playing, direct-play, local Emby movie", () => {
    const session = {
      Id: "e1",
      UserName: "dave",
      Client: "Emby Theater",
      DeviceName: "HTPC",
      RemoteEndPoint: "192.168.1.20",
      NowPlayingItem: { Id: "i2", Name: "Oppenheimer", Type: "Movie", RunTimeTicks: 1_000_000_000, ImageTags: {} },
      PlayState: { PositionTicks: 0, IsPaused: false, PlayMethod: "DirectPlay" },
    } as JellyfinSession;

    const s = mediaServerSessionToStream(session, "inst-2", "emby");
    expect(s.serviceId).toBe("emby");
    expect(s.title).toBe("Oppenheimer");
    expect(s.state).toBe("playing");
    expect(s.transcoding).toBe(false);
    expect(s.isLocal).toBe(true);
    expect(s.mediaType).toBe("movie");
  });
});

describe("navidromeNowPlayingToStream", () => {
  function entry(over: Partial<NavidromeNowPlayingEntry> = {}): NavidromeNowPlayingEntry {
    return {
      id: "song-1",
      title: "Xtal",
      artist: "Aphex Twin",
      album: "Selected Ambient Works 85-92",
      duration: 300,
      username: "renzo",
      minutesAgo: 0,
      playerId: 7,
      playerName: "Feishin",
      state: "playing",
      positionMs: 60_000,
      playbackRate: 1,
      ...over,
    };
  }

  it("maps a playing track, prefixing the artist onto the title", () => {
    const stream = navidromeNowPlayingToStream(entry(), "inst-1");
    expect(stream).toMatchObject({
      serviceId: "navidrome",
      instanceId: "inst-1",
      title: "Aphex Twin - Xtal",
      user: "renzo",
      device: "Feishin",
      state: "playing",
      mediaType: "music",
    });
    // positionMs is ms, duration is SECONDS — mixing the units would report 200x.
    expect(stream.progress).toBeCloseTo(0.2);
  });

  it("falls back to the bare title when the track has no artist", () => {
    expect(navidromeNowPlayingToStream(entry({ artist: undefined }), "i").title).toBe("Xtal");
  });

  it("reads Navidrome's paused state case-insensitively", () => {
    expect(navidromeNowPlayingToStream(entry({ state: "paused" }), "i").state).toBe("paused");
    expect(navidromeNowPlayingToStream(entry({ state: "Paused" }), "i").state).toBe("paused");
    expect(navidromeNowPlayingToStream(entry({ state: "playing" }), "i").state).toBe("playing");
  });

  it("does not divide by zero on a track with no duration", () => {
    expect(navidromeNowPlayingToStream(entry({ duration: 0 }), "i").progress).toBe(0);
  });

  it("clamps progress when the reported position overruns the duration", () => {
    expect(
      navidromeNowPlayingToStream(entry({ duration: 10, positionMs: 999_000 }), "i").progress,
    ).toBe(1);
  });

  // Navidrome reports neither transcoding metadata nor a client IP on this
  // endpoint, so both are structurally absent rather than unread.
  it("reports no transcoding and never guesses locality", () => {
    const stream = navidromeNowPlayingToStream(entry(), "inst-1");
    expect(stream.transcoding).toBe(false);
    expect(stream.isLocal).toBe(false);
  });

  it("keys per player and track so two clients never collide", () => {
    const a = navidromeNowPlayingToStream(entry({ playerId: 1 }), "inst-1");
    const b = navidromeNowPlayingToStream(entry({ playerId: 2 }), "inst-1");
    const other = navidromeNowPlayingToStream(entry({ playerId: 1 }), "inst-2");
    expect(new Set([a.key, b.key, other.key]).size).toBe(3);
  });
});

describe("filter helpers", () => {
  it("parseHiddenUsers lowercases, trims, drops blanks", () => {
    expect([...parseHiddenUsers(" Alice, bob ,, ")]).toEqual(["alice", "bob"]);
  });

  it("isLocalEndpoint detects RFC1918 + loopback, rejects public", () => {
    expect(isLocalEndpoint("192.168.1.5:1234")).toBe(true);
    expect(isLocalEndpoint("10.0.0.1")).toBe(true);
    expect(isLocalEndpoint("172.16.4.4")).toBe(true);
    expect(isLocalEndpoint("127.0.0.1")).toBe(true);
    expect(isLocalEndpoint("8.8.8.8")).toBe(false);
    expect(isLocalEndpoint(undefined)).toBe(false);
  });
});

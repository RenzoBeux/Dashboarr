// Mock native storage before importing — streaming-bandwidth pulls in
// now-playing-stream → plex-api → config-store → AsyncStorage/SecureStore at
// module load. The functions under test are pure. Same shims as the other tests.
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
  tautulliActivityToWanLan,
  plexSessionsToWanLan,
  mediaServerSessionsToWanLan,
  resolveStreamingService,
} from "@/lib/streaming-bandwidth";
import type {
  TautulliActivity,
  PlexSession,
  JellyfinSession,
} from "@/lib/types";

describe("tautulliActivityToWanLan", () => {
  it("reads the server-aggregated wan/lan fields (kbps)", () => {
    const activity = {
      wan_bandwidth: 8000,
      lan_bandwidth: 6000,
    } as TautulliActivity;
    expect(tautulliActivityToWanLan(activity)).toEqual({ wan: 8000, lan: 6000 });
  });

  it("is zero for missing data or missing fields", () => {
    expect(tautulliActivityToWanLan(undefined)).toEqual({ wan: 0, lan: 0 });
    expect(tautulliActivityToWanLan({} as TautulliActivity)).toEqual({
      wan: 0,
      lan: 0,
    });
  });
});

describe("plexSessionsToWanLan", () => {
  const session = (bandwidth: number, location: "lan" | "wan"): PlexSession =>
    ({ Session: { id: "s", bandwidth, location } } as PlexSession);

  it("sums per-session bandwidth into wan/lan buckets", () => {
    const out = plexSessionsToWanLan([
      session(8000, "wan"),
      session(2000, "wan"),
      session(6000, "lan"),
    ]);
    expect(out).toEqual({ wan: 10000, lan: 6000 });
  });

  it("treats a missing/unknown location as lan (local)", () => {
    const out = plexSessionsToWanLan([
      { Session: { id: "s", bandwidth: 1500 } } as PlexSession,
    ]);
    expect(out).toEqual({ wan: 0, lan: 1500 });
  });

  it("is zero for no sessions", () => {
    expect(plexSessionsToWanLan([])).toEqual({ wan: 0, lan: 0 });
    expect(plexSessionsToWanLan(undefined)).toEqual({ wan: 0, lan: 0 });
  });
});

describe("mediaServerSessionsToWanLan (Jellyfin/Emby)", () => {
  const session = (
    remote: string | undefined,
    bitrateBps?: number,
  ): JellyfinSession =>
    ({
      Id: "s",
      Client: "web",
      DeviceName: "tv",
      RemoteEndPoint: remote,
      ...(bitrateBps !== undefined
        ? { TranscodingInfo: { Bitrate: bitrateBps } }
        : {}),
    } as JellyfinSession);

  it("converts transcode bitrate (bps) to kbps and splits by endpoint", () => {
    const out = mediaServerSessionsToWanLan([
      session("203.0.113.7", 8_000_000), // remote → WAN, 8000 kbps
      session("192.168.1.20", 4_000_000), // local → LAN, 4000 kbps
    ]);
    expect(out).toEqual({ wan: 8000, lan: 4000 });
  });

  it("ignores direct-play sessions (no TranscodingInfo bitrate)", () => {
    const out = mediaServerSessionsToWanLan([
      session("192.168.1.20"), // direct play, no bitrate → contributes 0
      session("203.0.113.7", 5_000_000),
    ]);
    expect(out).toEqual({ wan: 5000, lan: 0 });
  });

  it("is zero for no sessions", () => {
    expect(mediaServerSessionsToWanLan(undefined)).toEqual({ wan: 0, lan: 0 });
  });
});

describe("resolveStreamingService", () => {
  it("keeps the stored preference when it is still configured", () => {
    expect(resolveStreamingService("plex", ["tautulli", "plex"])).toBe("plex");
  });

  it("falls back to the first configured service when the preference is gone", () => {
    expect(resolveStreamingService("plex", ["jellyfin", "emby"])).toBe("jellyfin");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveStreamingService("plex", [])).toBeNull();
  });
});

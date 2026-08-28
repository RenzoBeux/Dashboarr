// Mock the storage layer before importing anything that pulls in the config
// store (http-client → config-store → storage.ts → AsyncStorage/SecureStore),
// which aren't available in the jest-expo node environment.
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

import { useConfigStore } from "@/store/config-store";
import {
  getDelugeGlobalStats,
  getDelugeSpeedLimits,
  getDelugeTorrent,
  getDelugeTorrents,
} from "@/services/deluge-api";

// Exercises the full Deluge read path end-to-end in demo mode: the api builds
// the JSON-RPC body, the demo router (lib/demo-data.ts) dispatches off the
// method name and returns the `result` payload, and rawToUnified normalizes the
// hash-keyed dict into the shared UnifiedTorrent shape.
describe("deluge-api (demo mode)", () => {
  beforeAll(() => {
    useConfigStore.setState({ demoMode: true });
  });
  afterAll(() => {
    useConfigStore.setState({ demoMode: false });
  });

  it("lists and normalizes the demo torrents", async () => {
    const torrents = await getDelugeTorrents();
    expect(torrents).toHaveLength(3);

    const [downloading, seeding, paused] = torrents;

    expect(downloading.name).toContain("Ubuntu");
    expect(downloading.status).toBe("downloading");
    expect(downloading.sizeBytes).toBe(5_400_000_000);
    expect(downloading.dlSpeed).toBe(5_400_000);
    // Deluge reports progress as 0-100; the shared shape is a 0-1 fraction.
    expect(downloading.progress).toBeCloseTo(0.4, 5);
    expect(downloading.ratio).toBeCloseTo(0.12, 5);
    expect(downloading.label).toBe("linux-isos");
    // The hash is the DICT KEY, not a field on the value.
    expect(downloading.hash).toBe("00000000000000000000000000000000000d0a01");

    expect(seeding.status).toBe("seeding");
    expect(seeding.progress).toBe(1);
    expect(seeding.completedOn).toBe(1_716_690_000);

    expect(paused.status).toBe("paused");
    expect(paused.progress).toBeCloseTo(0.5, 5);
    // "OK" is Deluge's healthy message — it must never surface as an error.
    expect(paused.errorMessage).toBeUndefined();
  });

  it("reads global stats and converts KiB/s limits to bytes/s (KiB = 1024)", async () => {
    const stats = await getDelugeGlobalStats();
    expect(stats.dlSpeed).toBe(5_400_000);
    expect(stats.upSpeed).toBe(1_100_000);
    expect(stats.dlTotalLifetime).toBe(850_000_000_000);
    expect(stats.upTotalLifetime).toBe(420_000_000_000);
    // max_download_speed is -1 — Deluge's unlimited sentinel is any negative
    // value, which the adapter surface expresses as 0.
    expect(stats.dlLimit).toBe(0);
    // 500 KiB/s → bytes/s at 1024, not 1000 (Transmission's kB).
    expect(stats.upLimit).toBe(512_000);
  });

  it("reads the global speed limits in Deluge's own KiB/s units", async () => {
    const limits = await getDelugeSpeedLimits();
    expect(limits.maxDownload).toBe(-1);
    expect(limits.maxUpload).toBe(500);
  });

  it("loads a single torrent's detail with files and trackers", async () => {
    const detail = await getDelugeTorrent(
      "00000000000000000000000000000000000d0a01",
    );
    expect(detail).not.toBeNull();
    expect(detail?.torrent.name).toContain("Ubuntu");
    expect(detail?.files).toHaveLength(1);
    expect(detail?.files[0]?.path).toContain("ubuntu");
    expect(detail?.files[0]?.size).toBe(5_400_000_000);
    // file_progress is already a 0-1 fraction, unlike the torrent-level
    // `progress` — it must NOT be divided by 100 a second time.
    expect(detail?.files[0]?.progress).toBeCloseTo(0.4, 5);
    expect(detail?.trackers[0]?.url).toContain("torrent.ubuntu.com");
    expect(detail?.seeds).toBe("42 / 1240");
    expect(detail?.peers).toBe("8 / 86");
    expect(detail?.stopAtRatio).toBe(false);
    expect(detail?.stopRatio).toBe(2);
  });

  it("uppercase hashes still resolve — Deluge normalizes ids to lowercase", async () => {
    const detail = await getDelugeTorrent(
      "00000000000000000000000000000000000D0A01",
    );
    expect(detail?.torrent.name).toContain("Ubuntu");
  });

  it("returns null for an unknown torrent instead of throwing", async () => {
    await expect(getDelugeTorrent("deadbeef")).resolves.toBeNull();
  });
});

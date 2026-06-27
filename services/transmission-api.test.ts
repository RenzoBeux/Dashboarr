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
  getTransmissionTorrents,
  getTransmissionGlobalStats,
  getTransmissionSession,
  getTransmissionTorrent,
} from "@/services/transmission-api";

// Exercises the full Transmission read path end-to-end in demo mode: the api
// builds the JSON-RPC body, the demo router (lib/demo-data.ts) dispatches off the
// method name and returns the `arguments` payload, and rawToUnified normalizes
// the camelCase torrent fields into the shared UnifiedTorrent shape.
describe("transmission-api (demo mode)", () => {
  beforeAll(() => {
    useConfigStore.setState({ demoMode: true });
  });
  afterAll(() => {
    useConfigStore.setState({ demoMode: false });
  });

  it("lists and normalizes the demo torrents", async () => {
    const torrents = await getTransmissionTorrents();
    expect(torrents).toHaveLength(3);

    const [downloading, seeding, paused] = torrents;

    expect(downloading.name).toContain("Ubuntu");
    expect(downloading.status).toBe("downloading");
    expect(downloading.sizeBytes).toBe(5_400_000_000);
    expect(downloading.dlSpeed).toBe(5_400_000);
    expect(downloading.progress).toBeCloseTo(0.4, 5);
    expect(downloading.ratio).toBeCloseTo(0.12, 5);
    expect(downloading.label).toBe("linux-isos");

    // status 6 → seeding, percentDone 1 → progress 1
    expect(seeding.status).toBe("seeding");
    expect(seeding.progress).toBe(1);

    // status 0 (stopped) → paused
    expect(paused.status).toBe("paused");
  });

  it("reads global stats and converts kB/s limits to bytes/s (kB = 1000)", async () => {
    const stats = await getTransmissionGlobalStats();
    expect(stats.dlSpeed).toBe(5_400_000);
    expect(stats.upSpeed).toBe(1_100_000);
    expect(stats.dlTotalLifetime).toBe(850_000_000_000);
    expect(stats.upTotalLifetime).toBe(420_000_000_000);
    // speed-limit-down-enabled is false → no download limit.
    expect(stats.dlLimit).toBe(0);
    // speed-limit-up 500 kB/s enabled, turtle off → 500 * 1000 bytes/s.
    expect(stats.upLimit).toBe(500_000);
  });

  it("reads the session (speed limits + turtle state)", async () => {
    const session = await getTransmissionSession();
    expect(session.speedLimitUp).toBe(500);
    expect(session.speedLimitUpEnabled).toBe(true);
    expect(session.speedLimitDownEnabled).toBe(false);
    expect(session.altSpeedEnabled).toBe(false);
    expect(session.altSpeedDown).toBe(100);
  });

  it("loads a single torrent's detail with files and trackers", async () => {
    const detail = await getTransmissionTorrent(
      "0000000000000000000000000000000000000a01",
    );
    expect(detail).not.toBeNull();
    expect(detail?.torrent.name).toContain("Ubuntu");
    expect(detail?.files).toHaveLength(1);
    expect(detail?.files[0]?.name).toContain("ubuntu");
    expect(detail?.files[0]?.length).toBe(5_400_000_000);
    expect(detail?.trackers[0]?.host).toBe("torrent.ubuntu.com");
    expect(detail?.trackers[0]?.seederCount).toBe(1240);
    // global seed-ratio mode in the fixture
    expect(detail?.seedRatioMode).toBe(0);
  });
});

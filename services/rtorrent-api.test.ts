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
  getRtorrentTorrents,
  getRtorrentGlobalStats,
} from "@/services/rtorrent-api";

// Exercises the full rtorrent read path end-to-end in demo mode: the api builds
// XML-RPC, the demo router returns canned XML (lib/demo-data.ts), the real
// parser (lib/xmlrpc.ts) decodes it, and rowToUnified normalizes it.
describe("rtorrent-api (demo mode)", () => {
  beforeAll(() => {
    useConfigStore.setState({ demoMode: true });
  });
  afterAll(() => {
    useConfigStore.setState({ demoMode: false });
  });

  it("lists and normalizes the demo torrents", async () => {
    const torrents = await getRtorrentTorrents();
    expect(torrents).toHaveLength(3);

    const [downloading, seeding, paused] = torrents;

    expect(downloading.name).toContain("Ubuntu");
    expect(downloading.status).toBe("downloading");
    expect(downloading.sizeBytes).toBe(5_400_000_000);
    expect(downloading.dlSpeed).toBe(5_400_000);
    // progress = bytes_done / size_bytes = 2.16e9 / 5.4e9 = 0.4
    expect(downloading.progress).toBeCloseTo(0.4, 5);
    // ratio is per-mille (240 → 0.24)
    expect(downloading.ratio).toBeCloseTo(0.24, 5);
    expect(downloading.label).toBe("linux-isos");
    // hash is uppercased
    expect(downloading.hash).toBe(downloading.hash.toUpperCase());

    expect(seeding.status).toBe("seeding");
    expect(seeding.progress).toBe(1);

    expect(paused.status).toBe("paused");
  });

  it("reads global stats", async () => {
    const stats = await getRtorrentGlobalStats();
    expect(stats.dlSpeed).toBe(5_400_000);
    expect(stats.upSpeed).toBe(1_100_000);
    expect(stats.dlTotalLifetime).toBe(850_000_000_000);
    expect(stats.upTotalLifetime).toBe(420_000_000_000);
    expect(stats.dlLimit).toBe(0);
    expect(stats.upLimit).toBe(0);
  });
});

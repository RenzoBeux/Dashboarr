// Mock native storage before importing — arr-health pulls in http-client →
// config-store → AsyncStorage/SecureStore at module load. The function under
// test is pure. Same shims as the other unit tests.
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

import { testAllPathForHealthSource } from "@/services/arr-health";

// The source → "Test all" mapping mirrors the upstream *arr Health pages
// (issue #268): a wrong path 404s against a real instance, and a button on an
// unmapped source would break upstream parity.
describe("testAllPathForHealthSource", () => {
  it("maps indexer status checks on every *arr kind", () => {
    for (const kind of ["radarr", "sonarr", "prowlarr", "lidarr"] as const) {
      expect(testAllPathForHealthSource(kind, "IndexerStatusCheck")).toBe(
        "/indexer/testall",
      );
      expect(
        testAllPathForHealthSource(kind, "IndexerLongTermStatusCheck"),
      ).toBe("/indexer/testall");
      expect(
        testAllPathForHealthSource(kind, "DownloadClientStatusCheck"),
      ).toBe("/downloadclient/testall");
    }
  });

  it("maps application status checks on Prowlarr only", () => {
    expect(
      testAllPathForHealthSource("prowlarr", "ApplicationStatusCheck"),
    ).toBe("/applications/testall");
    expect(
      testAllPathForHealthSource("prowlarr", "ApplicationLongTermStatusCheck"),
    ).toBe("/applications/testall");
    expect(testAllPathForHealthSource("sonarr", "ApplicationStatusCheck")).toBe(
      null,
    );
    expect(testAllPathForHealthSource("radarr", "ApplicationStatusCheck")).toBe(
      null,
    );
  });

  it("returns null for sources without a test action", () => {
    expect(testAllPathForHealthSource("radarr", "UpdateCheck")).toBe(null);
    expect(testAllPathForHealthSource("radarr", "ImportListStatusCheck")).toBe(
      null,
    );
    expect(testAllPathForHealthSource("sonarr", "NotificationStatusCheck")).toBe(
      null,
    );
    expect(testAllPathForHealthSource("prowlarr", "IndexerRssCheck")).toBe(null);
  });
});

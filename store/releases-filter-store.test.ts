// Mock the storage layer before importing the store — releases-filter-store
// imports storage.ts at module load, which pulls in AsyncStorage/SecureStore.
// Both are native modules unavailable in the jest-expo node environment, so we
// replace them with no-op shims. setJSON/getJSON round-trip through storage.ts's
// in-memory cache (synchronous), so persistence is still observable in tests.
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
  useReleaseFilterStore,
  RELEASE_FILTER_DEFAULTS,
  type ProtocolFilter,
} from "./releases-filter-store";
import { getJSON, setJSON, deleteKey } from "./storage";

const STORAGE_KEY = "ui.releaseFilters";

beforeEach(() => {
  // Storage cache and the zustand store are module singletons shared across
  // tests, so reset both to a clean slate.
  deleteKey(STORAGE_KEY);
  useReleaseFilterStore.setState(RELEASE_FILTER_DEFAULTS);
});

describe("useReleaseFilterStore (#198)", () => {
  it("starts at the documented defaults", () => {
    const { hideRejected, protocol, quality, savedFilters } =
      useReleaseFilterStore.getState();
    expect({ hideRejected, protocol, quality, savedFilters }).toEqual(
      RELEASE_FILTER_DEFAULTS,
    );
    expect(RELEASE_FILTER_DEFAULTS).toEqual({
      hideRejected: true,
      protocol: "all",
      quality: null,
      savedFilters: {},
    });
  });

  it("each setter updates state AND write-through persists", () => {
    useReleaseFilterStore.getState().setHideRejected(false);
    useReleaseFilterStore.getState().setProtocol("torrent");
    useReleaseFilterStore.getState().setQuality("WEBDL-1080p");

    const { hideRejected, protocol, quality } =
      useReleaseFilterStore.getState();
    expect({ hideRejected, protocol, quality }).toEqual({
      hideRejected: false,
      protocol: "torrent",
      quality: "WEBDL-1080p",
    });
    // Only the persisted fields land in storage — not the methods.
    expect(getJSON(STORAGE_KEY)).toEqual({
      hideRejected: false,
      protocol: "torrent",
      quality: "WEBDL-1080p",
      savedFilters: {},
    });
  });

  it("setSavedFilter persists a per-instance selection, null clears it", () => {
    const s = useReleaseFilterStore.getState();
    s.setSavedFilter("sonarr:default", 3);
    s.setSavedFilter("radarr:default", 7);

    // Same filter id (3) is a DIFFERENT filter per instance — both kept apart.
    expect(useReleaseFilterStore.getState().savedFilters).toEqual({
      "sonarr:default": 3,
      "radarr:default": 7,
    });
    expect(getJSON<typeof RELEASE_FILTER_DEFAULTS>(STORAGE_KEY)?.savedFilters)
      .toEqual({ "sonarr:default": 3, "radarr:default": 7 });

    s.setSavedFilter("sonarr:default", null);
    expect(useReleaseFilterStore.getState().savedFilters).toEqual({
      "radarr:default": 7,
    });
  });

  it("hydrate() merges a partial stored blob over defaults", () => {
    // Forward-compat: an older/partial persisted blob (only protocol) must keep
    // the other fields at their current defaults rather than turning them
    // undefined. Pre-savedFilters blobs must still hydrate to an empty map.
    setJSON(STORAGE_KEY, { protocol: "usenet" as ProtocolFilter });

    useReleaseFilterStore.getState().hydrate();

    const { hideRejected, protocol, quality, savedFilters } =
      useReleaseFilterStore.getState();
    expect(protocol).toBe("usenet");
    expect(hideRejected).toBe(RELEASE_FILTER_DEFAULTS.hideRejected);
    expect(quality).toBe(RELEASE_FILTER_DEFAULTS.quality);
    expect(savedFilters).toEqual({});
  });

  it("hydrate() restores a persisted saved-filter selection", () => {
    setJSON(STORAGE_KEY, { savedFilters: { "sonarr:default": 5 } });

    useReleaseFilterStore.getState().hydrate();

    expect(useReleaseFilterStore.getState().savedFilters).toEqual({
      "sonarr:default": 5,
    });
  });

  it("hydrate() with nothing stored keeps defaults (no throw)", () => {
    expect(() => useReleaseFilterStore.getState().hydrate()).not.toThrow();
    const { hideRejected, protocol, quality, savedFilters } =
      useReleaseFilterStore.getState();
    expect({ hideRejected, protocol, quality, savedFilters }).toEqual(
      RELEASE_FILTER_DEFAULTS,
    );
  });

  it("reset() resets quick filters to defaults but keeps saved filters", () => {
    const s = useReleaseFilterStore.getState();
    s.setHideRejected(false);
    s.setProtocol("usenet");
    s.setQuality("Bluray-2160p");
    s.setSavedFilter("sonarr:default", 2);

    useReleaseFilterStore.getState().reset();

    const { hideRejected, protocol, quality, savedFilters } =
      useReleaseFilterStore.getState();
    expect({ hideRejected, protocol, quality }).toEqual({
      hideRejected: RELEASE_FILTER_DEFAULTS.hideRejected,
      protocol: RELEASE_FILTER_DEFAULTS.protocol,
      quality: RELEASE_FILTER_DEFAULTS.quality,
    });
    // Saved-filter selections survive "Clear filters" — the picker clears only
    // the current instance's selection on its own.
    expect(savedFilters).toEqual({ "sonarr:default": 2 });
    expect(getJSON(STORAGE_KEY)).toEqual({
      ...RELEASE_FILTER_DEFAULTS,
      savedFilters: { "sonarr:default": 2 },
    });
  });
});

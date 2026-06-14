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
    const { hideRejected, protocol, quality } =
      useReleaseFilterStore.getState();
    expect({ hideRejected, protocol, quality }).toEqual(RELEASE_FILTER_DEFAULTS);
    expect(RELEASE_FILTER_DEFAULTS).toEqual({
      hideRejected: true,
      protocol: "all",
      quality: null,
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
    // Only the three persisted fields land in storage — not the methods.
    expect(getJSON(STORAGE_KEY)).toEqual({
      hideRejected: false,
      protocol: "torrent",
      quality: "WEBDL-1080p",
    });
  });

  it("hydrate() merges a partial stored blob over defaults", () => {
    // Forward-compat: an older/partial persisted blob (only protocol) must keep
    // the other fields at their current defaults rather than turning them
    // undefined.
    setJSON(STORAGE_KEY, { protocol: "usenet" as ProtocolFilter });

    useReleaseFilterStore.getState().hydrate();

    const { hideRejected, protocol, quality } =
      useReleaseFilterStore.getState();
    expect(protocol).toBe("usenet");
    expect(hideRejected).toBe(RELEASE_FILTER_DEFAULTS.hideRejected);
    expect(quality).toBe(RELEASE_FILTER_DEFAULTS.quality);
  });

  it("hydrate() with nothing stored keeps defaults (no throw)", () => {
    expect(() => useReleaseFilterStore.getState().hydrate()).not.toThrow();
    const { hideRejected, protocol, quality } =
      useReleaseFilterStore.getState();
    expect({ hideRejected, protocol, quality }).toEqual(RELEASE_FILTER_DEFAULTS);
  });

  it("reset() returns state to defaults and persists them", () => {
    const s = useReleaseFilterStore.getState();
    s.setHideRejected(false);
    s.setProtocol("usenet");
    s.setQuality("Bluray-2160p");

    useReleaseFilterStore.getState().reset();

    const { hideRejected, protocol, quality } =
      useReleaseFilterStore.getState();
    expect({ hideRejected, protocol, quality }).toEqual(RELEASE_FILTER_DEFAULTS);
    expect(getJSON(STORAGE_KEY)).toEqual(RELEASE_FILTER_DEFAULTS);
  });
});

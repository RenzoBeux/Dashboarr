// Mock the storage layer before importing the store — library-tag-filter-store
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
  useLibraryTagFilterStore,
  LIBRARY_TAG_FILTER_DEFAULTS,
} from "./library-tag-filter-store";
import { getJSON, setJSON, deleteKey } from "./storage";

const STORAGE_KEY = "ui.libraryTagFilters";

function stored(): Record<string, number[]> | undefined {
  return getJSON<{ tagFilters: Record<string, number[]> }>(STORAGE_KEY)
    ?.tagFilters;
}

beforeEach(() => {
  // Storage cache and the zustand store are module singletons shared across
  // tests, so reset both to a clean slate.
  deleteKey(STORAGE_KEY);
  useLibraryTagFilterStore.setState(LIBRARY_TAG_FILTER_DEFAULTS);
});

describe("useLibraryTagFilterStore (#343)", () => {
  it("starts with no tag filter anywhere", () => {
    expect(useLibraryTagFilterStore.getState().tagFilters).toEqual({});
    expect(LIBRARY_TAG_FILTER_DEFAULTS).toEqual({ tagFilters: {} });
  });

  it("keeps each service and instance in its own bucket", () => {
    // The whole reason for the composite key: tag id 3 means something
    // different on every instance.
    const { setTags } = useLibraryTagFilterStore.getState();
    setTags("radarr:a", [3]);
    setTags("radarr:b", [7]);
    setTags("sonarr:a", [3]);
    expect(useLibraryTagFilterStore.getState().tagFilters).toEqual({
      "radarr:a": [3],
      "radarr:b": [7],
      "sonarr:a": [3],
    });
    expect(stored()).toEqual({
      "radarr:a": [3],
      "radarr:b": [7],
      "sonarr:a": [3],
    });
  });

  it("stores ids ascending so tap order never leaks into the blob", () => {
    useLibraryTagFilterStore.getState().setTags("radarr:a", [7, 2, 5]);
    expect(useLibraryTagFilterStore.getState().tagFilters["radarr:a"]).toEqual([
      2, 5, 7,
    ]);
    expect(stored()).toEqual({ "radarr:a": [2, 5, 7] });
  });

  it("deletes the key on an empty selection instead of leaving a tombstone", () => {
    const { setTags } = useLibraryTagFilterStore.getState();
    setTags("radarr:a", [3]);
    setTags("radarr:a", []);
    expect(useLibraryTagFilterStore.getState().tagFilters).toEqual({});
    expect(stored()).toEqual({});
  });

  it("toggles an id on and back off", () => {
    const { toggleTag } = useLibraryTagFilterStore.getState();
    toggleTag("radarr:a", 4, [2]);
    expect(useLibraryTagFilterStore.getState().tagFilters["radarr:a"]).toEqual([
      2, 4,
    ]);
    toggleTag("radarr:a", 4, [2, 4]);
    expect(useLibraryTagFilterStore.getState().tagFilters["radarr:a"]).toEqual([
      2,
    ]);
  });

  it("drops the key when the last selected tag is toggled off", () => {
    useLibraryTagFilterStore.getState().toggleTag("radarr:a", 2, [2]);
    expect(useLibraryTagFilterStore.getState().tagFilters).toEqual({});
  });

  it("prunes ids for deleted tags via the resolved base", () => {
    // Stored is [3, 99] but tag 99 was deleted in Radarr, so the caller passes
    // the resolved [3]. The next toggle writes without the dead id.
    useLibraryTagFilterStore.getState().setTags("radarr:a", [3, 99]);
    useLibraryTagFilterStore.getState().toggleTag("radarr:a", 5, [3]);
    expect(useLibraryTagFilterStore.getState().tagFilters["radarr:a"]).toEqual([
      3, 5,
    ]);
  });

  it("hydrate() merges a partial stored blob over defaults", () => {
    setJSON(STORAGE_KEY, { tagFilters: { "sonarr:x": [1, 2] } });
    useLibraryTagFilterStore.getState().hydrate();
    expect(useLibraryTagFilterStore.getState().tagFilters).toEqual({
      "sonarr:x": [1, 2],
    });
  });

  it("hydrate() with nothing stored keeps defaults (no throw)", () => {
    expect(() =>
      useLibraryTagFilterStore.getState().hydrate(),
    ).not.toThrow();
    expect(useLibraryTagFilterStore.getState().tagFilters).toEqual({});
  });
});

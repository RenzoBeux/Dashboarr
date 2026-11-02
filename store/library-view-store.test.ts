// Mock the native storage modules before importing the store (see
// library-tag-filter-store.test.ts for why); setJSON/getJSON round-trip
// through storage.ts's in-memory cache.
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

import { useLibraryViewStore } from "./library-view-store";
import { getJSON, setJSON } from "./storage";

const STORAGE_KEY = "ui.libraryViews";

beforeEach(() => {
  useLibraryViewStore.setState({ modes: {} });
  setJSON(STORAGE_KEY, {});
});

describe("library view store", () => {
  it("persists a mode per screen", () => {
    useLibraryViewStore.getState().setMode("bazarr-movies", "poster");
    expect(useLibraryViewStore.getState().modes["bazarr-movies"]).toBe("poster");
    expect(getJSON(STORAGE_KEY)).toEqual({ modes: { "bazarr-movies": "poster" } });
  });

  it("hydrates stored modes and drops invalid ones", () => {
    setJSON(STORAGE_KEY, { modes: { radarr: "list", sonarr: "grid", other: 3 } });
    useLibraryViewStore.getState().hydrate();
    expect(useLibraryViewStore.getState().modes).toEqual({ radarr: "list" });
  });

  it("ignores a missing or malformed blob", () => {
    setJSON(STORAGE_KEY, "nonsense");
    useLibraryViewStore.getState().hydrate();
    expect(useLibraryViewStore.getState().modes).toEqual({});
  });
});

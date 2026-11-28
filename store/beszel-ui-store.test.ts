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

import { useBeszelUiStore } from "./beszel-ui-store";
import { getJSON, setJSON } from "./storage";

const STORAGE_KEY = "ui.beszelRange";

beforeEach(() => {
  useBeszelUiStore.setState({ range: "1h" });
  setJSON(STORAGE_KEY, null);
});

describe("useBeszelUiStore", () => {
  it("defaults to the 1h range", () => {
    useBeszelUiStore.getState().hydrate();
    expect(useBeszelUiStore.getState().range).toBe("1h");
  });

  it("persists the chosen range and restores it on hydrate", () => {
    useBeszelUiStore.getState().setRange("1w");
    expect(getJSON(STORAGE_KEY)).toBe("1w");
    useBeszelUiStore.setState({ range: "1h" });
    useBeszelUiStore.getState().hydrate();
    expect(useBeszelUiStore.getState().range).toBe("1w");
  });

  it("ignores a stored value that is no longer a valid range", () => {
    setJSON(STORAGE_KEY, "6h");
    useBeszelUiStore.getState().hydrate();
    expect(useBeszelUiStore.getState().range).toBe("1h");
  });
});

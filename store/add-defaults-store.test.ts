// Mock the storage layer before importing the store — add-defaults-store imports
// storage.ts at module load, which pulls in AsyncStorage/SecureStore (native
// modules unavailable in the jest-expo node environment). setJSON/getJSON
// round-trip through storage.ts's synchronous in-memory cache, so persistence
// is still observable in tests.
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
  useAddDefaultsStore,
  addDefaultsKey,
  validRememberedTags,
  type LastUsedAdd,
} from "./add-defaults-store";
import { getJSON, setJSON, deleteKey } from "./storage";

const STORAGE_KEY = "ui.lastUsedAdd";

beforeEach(() => {
  deleteKey(STORAGE_KEY);
  useAddDefaultsStore.setState({ lastUsed: {} });
});

describe("useAddDefaultsStore (#341)", () => {
  it("remembers a config per instance key and persists it", () => {
    const key = addDefaultsKey("radarr", "inst-1");
    const config: LastUsedAdd = {
      qualityProfileId: 4,
      rootFolderPath: "/movies",
      tags: [2, 5],
      searchOnAdd: false,
    };
    useAddDefaultsStore.getState().remember(key, config);

    expect(useAddDefaultsStore.getState().lastUsed[key]).toEqual(config);
    expect(getJSON<Record<string, LastUsedAdd>>(STORAGE_KEY)?.[key]).toEqual(config);
  });

  it("keeps each instance's config separate (ids are per-instance)", () => {
    const store = useAddDefaultsStore.getState();
    store.remember(addDefaultsKey("radarr", "a"), { qualityProfileId: 1, searchOnAdd: true });
    store.remember(addDefaultsKey("sonarr", "a"), { qualityProfileId: 9, searchOnAdd: false });

    const all = useAddDefaultsStore.getState().lastUsed;
    expect(all["radarr:a"]?.qualityProfileId).toBe(1);
    expect(all["sonarr:a"]?.qualityProfileId).toBe(9);
  });

  it("a second remember for the same key overwrites the first", () => {
    const key = addDefaultsKey("lidarr", "x");
    const store = useAddDefaultsStore.getState();
    store.remember(key, { qualityProfileId: 1, tags: [1] });
    store.remember(key, { qualityProfileId: 2, tags: [] });
    expect(useAddDefaultsStore.getState().lastUsed[key]).toEqual({ qualityProfileId: 2, tags: [] });
  });

  it("hydrate loads a persisted blob back into the store", () => {
    setJSON(STORAGE_KEY, { "radarr:x": { rootFolderPath: "/m", tags: [1] } });
    useAddDefaultsStore.getState().hydrate();
    expect(useAddDefaultsStore.getState().lastUsed["radarr:x"]).toEqual({ rootFolderPath: "/m", tags: [1] });
  });

  it("hydrate is a safe no-op when nothing is stored", () => {
    expect(() => useAddDefaultsStore.getState().hydrate()).not.toThrow();
    expect(useAddDefaultsStore.getState().lastUsed).toEqual({});
  });
});

describe("validRememberedTags (#402)", () => {
  const tags = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("drops a remembered tag that was deleted on the server", () => {
    expect(validRememberedTags([1, 2, 99], tags)).toEqual([1, 2]);
  });

  it("is empty when tags haven't loaded or nothing was remembered", () => {
    expect(validRememberedTags([1, 2], undefined)).toEqual([]);
    expect(validRememberedTags(undefined, tags)).toEqual([]);
  });
});

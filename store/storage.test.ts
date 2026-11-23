// In-memory AsyncStorage and SecureStore that can fail the way the native
// modules do, so the restore journal is tested against partial writes and
// app kills rather than against all-or-nothing mocks.
const mockDisk = new Map<string, string>();
const mockKeychain = new Map<string, string>();
const mockFailingKeys = new Set<string>();
const mockStall = { multiSetAfter: null as number | null, multiRemove: false };

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockDisk.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      if (mockFailingKeys.has(key)) throw new Error(`Could not write ${key}`);
      mockDisk.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockDisk.delete(key);
    }),
    getAllKeys: jest.fn(async () => [...mockDisk.keys()]),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockDisk.get(key) ?? null])),
    // iOS writes each large value to its own file before it saves the
    // manifest, so a kill can leave the first few entries written.
    multiSet: jest.fn(async (entries: [string, string][]) => {
      const limit = mockStall.multiSetAfter;
      mockStall.multiSetAfter = null;
      for (const [key, value] of limit === null ? entries : entries.slice(0, limit)) {
        mockDisk.set(key, value);
      }
      if (limit !== null) await new Promise(() => {});
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      if (mockStall.multiRemove) {
        mockStall.multiRemove = false;
        await new Promise(() => {});
      }
      for (const key of keys) mockDisk.delete(key);
    }),
  },
}));
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  // The JS wrapper defaults undefined options to {}, but null reaches the
  // native argument conversion, which rejects it.
  setItemAsync: jest.fn(async (key: string, value: string, options: unknown = {}) => {
    if (options === null) throw new Error("Cannot convert null to SecureStoreOptions");
    if (mockFailingKeys.has(key)) throw new Error(`Keychain refused ${key}`);
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    if (mockFailingKeys.has(key)) throw new Error(`Keychain refused ${key}`);
    mockKeychain.delete(key);
  }),
}));

type Storage = typeof import("./storage");

/** A fresh module, as after the app was killed and opened again. */
async function launch(): Promise<Storage> {
  jest.resetModules();
  const storage: Storage = require("./storage");
  await storage.initStorage();
  return storage;
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
}

const JOURNAL = "restore.journal";
const SNAPSHOT = "app.restoreSnapshot";
const COMMITTED = "app.restoreCommitted";

beforeEach(() => {
  mockDisk.clear();
  mockKeychain.clear();
  mockFailingKeys.clear();
  mockStall.multiSetAfter = null;
  mockStall.multiRemove = false;
});

describe("persistRestore and recoverInterruptedRestore", () => {
  it("puts back settings a killed batch had already written, along with the keychain", async () => {
    mockDisk.set("settings.a", "old-a");
    mockDisk.set("settings.b", "old-b");
    mockKeychain.set("secret.a", "old");
    const storage = await launch();
    mockStall.multiSetAfter = 1;
    void storage.persistRestore(
      [["secret.a", "new"], ["secret.b", "added"]],
      [["settings.a", "new-a"], ["settings.b", "new-b"], ["settings.c", "new-c"]],
      [],
      jest.fn(),
    );
    await settle();
    expect(mockDisk.get("settings.a")).toBe("new-a");
    expect(mockKeychain.get("secret.a")).toBe("new");

    const relaunched = await launch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe(true);
    expect(mockDisk.get("settings.a")).toBe("old-a");
    expect(mockDisk.get("settings.b")).toBe("old-b");
    expect(mockDisk.has("settings.c")).toBe(false);
    expect(mockKeychain.get("secret.a")).toBe("old");
    expect(mockKeychain.has("secret.b")).toBe(false);
    expect(mockKeychain.has(JOURNAL)).toBe(false);
    expect(mockDisk.has(SNAPSHOT)).toBe(false);
  });

  it("only commits once the removals landed too", async () => {
    mockDisk.set("settings.a", "old-a");
    mockDisk.set("legacy", "kept");
    const storage = await launch();
    mockStall.multiRemove = true;
    void storage.persistRestore([], [["settings.a", "new-a"], ["legacy", null]], [], jest.fn());
    await settle();
    expect(mockDisk.has(COMMITTED)).toBe(false);

    const relaunched = await launch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe(true);
    expect(mockDisk.get("settings.a")).toBe("old-a");
    expect(mockDisk.get("legacy")).toBe("kept");
  });

  it("puts back a credential that was stored without keychain options", async () => {
    mockKeychain.set("secret.a", "old");
    const storage = await launch();
    mockStall.multiSetAfter = 0;
    void storage.persistRestore([["secret.a", "new"]], [["settings.a", "x"]], [], jest.fn());
    await settle();

    const relaunched = await launch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe(true);
    expect(mockKeychain.get("secret.a")).toBe("old");
    expect(mockKeychain.has(JOURNAL)).toBe(false);
  });

  it("refuses a new restore while the previous one cannot be undone, keeping its journal", async () => {
    mockDisk.set("settings.a", "old-a");
    mockKeychain.set("secret.a", "old");
    const storage = await launch();
    mockStall.multiSetAfter = 0;
    void storage.persistRestore([["secret.a", "new"]], [["settings.a", "new-a"]], [], jest.fn());
    await settle();

    const relaunched = await launch();
    mockFailingKeys.add("secret.a");
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe(false);
    // The settings half is undone already.
    expect(mockDisk.get("settings.a")).toBe("old-a");
    const journal = mockKeychain.get(JOURNAL);
    expect(journal).toBeDefined();

    const onCommit = jest.fn();
    await expect(
      relaunched.persistRestore([["secret.a", "newer"]], [["settings.a", "newer-a"]], [], onCommit),
    ).rejects.toThrow("previous restore");
    expect(onCommit).not.toHaveBeenCalled();
    expect(mockKeychain.get(JOURNAL)).toBe(journal);
    expect(mockDisk.get("settings.a")).toBe("old-a");

    // Once the keychain works again, the next restore undoes the old one first.
    mockFailingKeys.clear();
    await relaunched.persistRestore([["secret.a", "newer"]], [["settings.a", "newer-a"]], [], onCommit);
    expect(onCommit).toHaveBeenCalled();
    expect(mockKeychain.get("secret.a")).toBe("newer");
    expect(mockDisk.get("settings.a")).toBe("newer-a");
    expect(mockKeychain.has(JOURNAL)).toBe(false);
  });

  it("puts the settings back when the commit marker cannot be written", async () => {
    mockDisk.set("settings.a", "old-a");
    mockKeychain.set("secret.a", "old");
    const storage = await launch();
    mockFailingKeys.add(COMMITTED);
    const onCommit = jest.fn();
    await expect(
      storage.persistRestore([["secret.a", "new"]], [["settings.a", "new-a"], ["settings.b", "new-b"]], [], onCommit),
    ).rejects.toThrow(`Could not write ${COMMITTED}`);
    expect(onCommit).not.toHaveBeenCalled();
    expect(mockDisk.get("settings.a")).toBe("old-a");
    expect(mockDisk.has("settings.b")).toBe(false);
    expect(storage.getString("settings.a")).toBe("old-a");
    expect(storage.getString("settings.b")).toBeUndefined();
    expect(mockKeychain.get("secret.a")).toBe("old");
    expect(mockKeychain.has(JOURNAL)).toBe(false);
    expect(mockDisk.has(SNAPSHOT)).toBe(false);
  });

  it("finishes deleting replaced credentials on the next launch once the settings were saved", async () => {
    mockKeychain.set("secrets.gone.apiKey", "old");
    const storage = await launch();
    mockFailingKeys.add("secrets.gone.apiKey");
    const onCommit = jest.fn();
    await storage.persistRestore([], [["settings.a", "v"]], ["secrets.gone.apiKey"], onCommit);
    expect(onCommit).toHaveBeenCalled();
    expect(mockKeychain.has("secrets.gone.apiKey")).toBe(true);
    expect(mockKeychain.has(JOURNAL)).toBe(true);
    expect(mockDisk.has(SNAPSHOT)).toBe(false);

    mockFailingKeys.clear();
    const relaunched = await launch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe(true);
    expect(mockKeychain.has("secrets.gone.apiKey")).toBe(false);
    expect(mockKeychain.has(JOURNAL)).toBe(false);
    expect(mockDisk.has(COMMITTED)).toBe(false);
    expect(mockDisk.get("settings.a")).toBe("v");
  });
});

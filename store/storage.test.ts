// In-memory AsyncStorage and SecureStore that can fail the way the native
// modules do, so the restore journal is tested against partial writes and
// app kills rather than against all-or-nothing mocks.
const mockDisk = new Map<string, string>();
const mockKeychain = new Map<string, string>();
const mockFailingKeys = new Set<string>();
// `batchWith`: the multiSet holding that key writes `after` entries and hangs.
const mockStall = { batchWith: null as string | null, after: 0, multiRemove: false };
// Android cannot read back a row over about 2 MB (its CursorWindow size).
const mockRowLimit = { length: Infinity };

function mockRead(key: string): string | null {
  const value = mockDisk.get(key) ?? null;
  if (value !== null && value.length > mockRowLimit.length) {
    throw new Error(`Row too big to fit into CursorWindow: ${key}`);
  }
  return value;
}

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockRead(key)),
    setItem: jest.fn(async (key: string, value: string) => {
      if (mockFailingKeys.has(key)) throw new Error(`Could not write ${key}`);
      mockDisk.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockDisk.delete(key);
    }),
    getAllKeys: jest.fn(async () => [...mockDisk.keys()]),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockRead(key)])),
    // iOS writes each large value to its own file before it saves the
    // manifest, so a kill can leave the first few entries written.
    multiSet: jest.fn(async (entries: [string, string][]) => {
      const stall = entries.some(([key]) => key === mockStall.batchWith);
      if (stall) mockStall.batchWith = null;
      for (const [key, value] of stall ? entries.slice(0, mockStall.after) : entries) {
        mockDisk.set(key, value);
      }
      if (stall) await new Promise(() => {});
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
function relaunch(): Storage {
  jest.resetModules();
  return require("./storage");
}

async function launch(): Promise<Storage> {
  const storage = relaunch();
  await storage.initStorage();
  return storage;
}

/** Kill the app once the settings batch holding `key` wrote `after` entries. */
function killDuringBatch(key: string, after: number) {
  mockStall.batchWith = key;
  mockStall.after = after;
}

function snapshotRows(): string[] {
  return [...mockDisk.keys()].filter((key) => key.startsWith(SNAPSHOT));
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
  mockStall.batchWith = null;
  mockStall.multiRemove = false;
  mockRowLimit.length = Infinity;
});

describe("persistRestore and recoverInterruptedRestore", () => {
  it("puts back settings a killed batch had already written, along with the keychain", async () => {
    mockDisk.set("settings.a", "old-a");
    mockDisk.set("settings.b", "old-b");
    mockKeychain.set("secret.a", "old");
    const storage = await launch();
    killDuringBatch("settings.a", 1);
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
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("none");
    expect(mockDisk.get("settings.a")).toBe("old-a");
    expect(mockDisk.get("settings.b")).toBe("old-b");
    expect(mockDisk.has("settings.c")).toBe(false);
    expect(mockKeychain.get("secret.a")).toBe("old");
    expect(mockKeychain.has("secret.b")).toBe(false);
    expect(mockKeychain.has(JOURNAL)).toBe(false);
    expect(snapshotRows()).toEqual([]);
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
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("none");
    expect(mockDisk.get("settings.a")).toBe("old-a");
    expect(mockDisk.get("legacy")).toBe("kept");
  });

  it("puts back a credential that was stored without keychain options", async () => {
    mockKeychain.set("secret.a", "old");
    const storage = await launch();
    killDuringBatch("settings.a", 0);
    void storage.persistRestore([["secret.a", "new"]], [["settings.a", "x"]], [], jest.fn());
    await settle();

    const relaunched = await launch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("none");
    expect(mockKeychain.get("secret.a")).toBe("old");
    expect(mockKeychain.has(JOURNAL)).toBe(false);
  });

  it("refuses a new restore while the previous one cannot be undone, keeping its journal", async () => {
    mockDisk.set("settings.a", "old-a");
    mockKeychain.set("secret.a", "old");
    const storage = await launch();
    killDuringBatch("settings.a", 0);
    void storage.persistRestore([["secret.a", "new"]], [["settings.a", "new-a"]], [], jest.fn());
    await settle();

    const relaunched = await launch();
    mockFailingKeys.add("secret.a");
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("pending");
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
    // A relaunch must not load the settings yet either.
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("pending");

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
    expect(snapshotRows()).toEqual([]);
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
    expect(snapshotRows()).toEqual([]);

    // The settings and credentials are consistent, so they may load, but the
    // journal must not be replaced yet.
    const stillFailing = await launch();
    await expect(stillFailing.recoverInterruptedRestore()).resolves.toBe("cleanup");
    await expect(
      stillFailing.persistRestore([], [["settings.a", "w"]], [], jest.fn()),
    ).rejects.toThrow("previous restore");

    mockFailingKeys.clear();
    const relaunched = await launch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("none");
    expect(mockKeychain.has("secrets.gone.apiKey")).toBe(false);
    expect(mockKeychain.has(JOURNAL)).toBe(false);
    expect(mockDisk.has(COMMITTED)).toBe(false);
    expect(mockDisk.get("settings.a")).toBe("v");
  });

  it("puts back settings that only fit Android's row limit one per row", async () => {
    mockRowLimit.length = 1000;
    mockDisk.set("settings.a", "a".repeat(600));
    mockDisk.set("settings.b", "b".repeat(600));
    const storage = await launch();
    killDuringBatch("settings.a", 1);
    void storage.persistRestore([], [["settings.a", "new-a"], ["settings.b", "new-b"]], [], jest.fn());
    await settle();
    expect(mockDisk.get("settings.a")).toBe("new-a");

    // As the app boots: recover, then load every row.
    const relaunched = relaunch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("none");
    await relaunched.initStorage();
    expect(relaunched.getString("settings.a")).toBe("a".repeat(600));
    expect(relaunched.getString("settings.b")).toBe("b".repeat(600));
    expect(snapshotRows()).toEqual([]);
  });

  it("stays pending rather than load settings it cannot put back", async () => {
    mockDisk.set("settings.a", "old-a");
    const storage = await launch();
    killDuringBatch("settings.a", 1);
    void storage.persistRestore([], [["settings.a", "new-a"]], [], jest.fn());
    await settle();
    for (const row of snapshotRows()) if (row !== SNAPSHOT) mockDisk.delete(row);

    const relaunched = relaunch();
    await expect(relaunched.recoverInterruptedRestore()).resolves.toBe("pending");
    expect(mockKeychain.has(JOURNAL)).toBe(true);
  });
});

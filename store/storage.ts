import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// In-memory cache — populated once during initStorage(), then all reads are sync
const cache: Record<string, string> = {};

export async function initStorage(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.multiGet(keys as string[]);
  for (const [key, value] of entries) {
    if (key && value !== null) cache[key] = value;
  }
}

// --- Sync helpers (read from cache, write-through to AsyncStorage) ---

export function getString(key: string): string | undefined {
  return cache[key];
}

export function setString(key: string, value: string): void {
  cache[key] = value;
  AsyncStorage.setItem(key, value);
}

export function getBoolean(key: string): boolean {
  return cache[key] === "true";
}

export function setBoolean(key: string, value: boolean): void {
  cache[key] = String(value);
  AsyncStorage.setItem(key, String(value));
}

export function deleteKey(key: string): void {
  delete cache[key];
  AsyncStorage.removeItem(key);
}

// --- SecureStore helpers (API keys, passwords) ---

export async function getSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function setSecret(
  key: string,
  value: string,
  options?: SecureStore.SecureStoreOptions,
): Promise<void> {
  await SecureStore.setItemAsync(key, value, options);
}

export async function deleteSecret(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

// --- JSON helpers ---

export function getJSON<T>(key: string): T | undefined {
  const raw = cache[key];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function setJSON(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  cache[key] = json;
  AsyncStorage.setItem(key, json);
}

// Atomic multi-key write. Use when two keys must land together or not at all
// (e.g. `dashboards` + `activeDashboardId`): `multiSet` batches them into one
// AsyncStorage operation, so a crash/kill can't persist one without the other
// and leave the pair desynced. Each value is pre-serialized by the caller.
export function setMany(entries: [string, string][]): void {
  for (const [key, value] of entries) cache[key] = value;
  AsyncStorage.multiSet(entries);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A batched AsyncStorage write. A null value removes the key. */
export type StorageEntry = [key: string, value: string | null];

// Restore needs to observe native write errors before changing the live cache.
export async function persistMany(entries: StorageEntry[]): Promise<void> {
  const previous: [string, string][] = [];
  const missing: string[] = [];
  for (const [key] of entries) {
    const value = getString(key);
    if (value === undefined) missing.push(key);
    else previous.push([key, value]);
  }
  const sets = entries.filter((entry): entry is [string, string] => entry[1] !== null);
  const removes = entries.filter(([, value]) => value === null).map(([key]) => key);
  try {
    if (sets.length > 0) await AsyncStorage.multiSet(sets);
    if (removes.length > 0) await AsyncStorage.multiRemove(removes);
  } catch (error) {
    // The iOS implementation can report an error after writing some entries.
    try {
      if (previous.length > 0) await AsyncStorage.multiSet(previous);
      if (missing.length > 0) await AsyncStorage.multiRemove(missing);
    } catch {
      throw new Error(
        `${errorMessage(error)} The previous settings could not be put back either.`,
      );
    }
    throw error;
  }
  for (const [key, value] of entries) {
    if (value === null) delete cache[key];
    else cache[key] = value;
  }
}

export type SecretChange = [
  key: string,
  value: string | null,
  options?: SecureStore.SecureStoreOptions,
];

// A restore writes the keychain first and AsyncStorage last, and the app can
// be killed in between. The journal records what the keychain held before so
// the next launch can tell an interrupted restore (AsyncStorage never got the
// commit marker: put the keychain back) from a finished one (marker present:
// finish deleting the superseded credentials). It holds the previous
// credentials, so it lives in the keychain too, as strictly as the strictest
// entry it may hold (the backup key is this-device-only).
const RESTORE_JOURNAL_KEY = "restore.journal";
const RESTORE_COMMIT_KEY = "app.restoreCommitted";
const RESTORE_JOURNAL_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface RestoreJournal {
  id: string;
  previous: SecretChange[];
  cleanup: string[];
}

function parseJournal(raw: string): RestoreJournal | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { id, previous, cleanup } = value as Partial<RestoreJournal>;
    if (typeof id !== "string" || !Array.isArray(previous) || !Array.isArray(cleanup)) return null;
    return { id, previous, cleanup };
  } catch {
    return null;
  }
}

async function putBackSecrets(changes: SecretChange[]): Promise<boolean> {
  const results = await Promise.allSettled(
    changes.map(async ([key, value, options]) => {
      if (await getSecret(key) === value) return;
      if (value === null) await deleteSecret(key);
      else await setSecret(key, value, options);
    }),
  );
  return results.every((result) => result.status === "fulfilled");
}

async function finishRestore(journal: RestoreJournal): Promise<void> {
  const results = await Promise.allSettled(journal.cleanup.map((key) => deleteSecret(key)));
  // Keep the journal so the next launch retries what could not be deleted.
  if (results.some((result) => result.status === "rejected")) {
    console.warn("Some credentials for removed service instances could not be cleared yet.");
    return;
  }
  await deleteSecret(RESTORE_JOURNAL_KEY);
  delete cache[RESTORE_COMMIT_KEY];
  await AsyncStorage.removeItem(RESTORE_COMMIT_KEY);
}

/**
 * Finish or undo a restore the app was killed in the middle of. Runs at launch
 * before any store reads the keychain, and before a new restore starts.
 */
export async function recoverInterruptedRestore(): Promise<void> {
  try {
    const raw = await getSecret(RESTORE_JOURNAL_KEY);
    if (!raw) return;
    const journal = parseJournal(raw);
    if (!journal) {
      await deleteSecret(RESTORE_JOURNAL_KEY);
      return;
    }
    if ((await AsyncStorage.getItem(RESTORE_COMMIT_KEY)) === journal.id) {
      await finishRestore(journal);
    } else if (await putBackSecrets(journal.previous)) {
      await deleteSecret(RESTORE_JOURNAL_KEY);
    }
  } catch (error) {
    console.warn("Could not recover an interrupted settings restore", error);
  }
}

/**
 * Apply a restore all or nothing: the keychain `changes`, then the AsyncStorage
 * `entries` in one batch, then delete the `cleanup` keychain keys (credentials
 * of instances the restore replaced). A failure before the batch lands puts
 * the keychain back; being killed is handled by recoverInterruptedRestore.
 * `onCommit` runs right after the batch lands, before the cleanup, so the
 * caller can switch its in-memory state without waiting for the deletes.
 */
export async function persistRestore(
  changes: SecretChange[],
  entries: StorageEntry[],
  cleanup: string[],
  onCommit: () => void,
): Promise<void> {
  await recoverInterruptedRestore();
  const current = await Promise.all(changes.map(async ([key]) => getSecret(key)));
  const pending: SecretChange[] = [];
  const previous: SecretChange[] = [];
  changes.forEach(([key, value, options], index) => {
    if (value === current[index]) return;
    pending.push([key, value, options]);
    previous.push([key, current[index], options]);
  });
  const journal: RestoreJournal = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
    previous,
    cleanup,
  };
  await setSecret(RESTORE_JOURNAL_KEY, JSON.stringify(journal), RESTORE_JOURNAL_OPTIONS);
  const attempted: SecretChange[] = [];
  try {
    for (const [index, [key, value, options]] of pending.entries()) {
      attempted.push(previous[index]);
      if (value === null) await deleteSecret(key);
      else await setSecret(key, value, options);
    }
    await persistMany([...entries, [RESTORE_COMMIT_KEY, journal.id]]);
  } catch (error) {
    if (await putBackSecrets(attempted)) {
      await deleteSecret(RESTORE_JOURNAL_KEY).catch(() => {});
      throw error;
    }
    // The journal stays, so the next launch puts the rest back.
    throw new Error(
      `${errorMessage(error)} Some previous credentials could not be put back yet; the app will retry on its next launch.`,
    );
  }
  onCommit();
  // A failed cleanup leaves the journal for the next launch.
  await finishRestore(journal).catch((error) => {
    console.warn("Could not finish clearing replaced credentials", error);
  });
}

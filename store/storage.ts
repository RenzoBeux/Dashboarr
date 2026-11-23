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

// Updates the cache only once the batch landed. No rollback of its own: on
// iOS a failed or killed multiSet can leave some keys written, so a restore
// undoes it from its snapshot instead.
async function writeEntries(entries: StorageEntry[]): Promise<void> {
  const sets = entries.filter((entry): entry is [string, string] => entry[1] !== null);
  const removes = entries.filter(([, value]) => value === null).map(([key]) => key);
  if (sets.length > 0) await AsyncStorage.multiSet(sets);
  if (removes.length > 0) await AsyncStorage.multiRemove(removes);
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

// Leaves options out instead of storing undefined, which JSON would turn into
// a null that SecureStore's native side rejects.
function secretChange(
  key: string,
  value: string | null,
  options?: SecureStore.SecureStoreOptions,
): SecretChange {
  return options ? [key, value, options] : [key, value];
}

// A restore writes the keychain, then the settings batch, then a commit
// marker, and the app can be killed anywhere in between. Before changing
// anything it records what it will overwrite: the previous credentials in a
// journal in the keychain (as strictly as the strictest entry it may hold, the
// backup key being this-device-only), and the previous settings in a snapshot
// in AsyncStorage, which holds no credentials. The next launch then either
// finishes the restore (the marker matches the journal) or puts both back.
const RESTORE_JOURNAL_KEY = "restore.journal";
const RESTORE_SNAPSHOT_KEY = "app.restoreSnapshot";
const RESTORE_COMMIT_KEY = "app.restoreCommitted";
const RESTORE_JOURNAL_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface RestoreJournal {
  id: string;
  previous: SecretChange[];
  cleanup: string[];
}

interface RestoreSnapshot {
  id: string;
  entries: StorageEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSecretChange(value: unknown): SecretChange | null {
  if (!Array.isArray(value)) return null;
  const [key, secret, options] = value as unknown[];
  if (typeof key !== "string" || (secret !== null && typeof secret !== "string")) return null;
  return secretChange(key, secret, isRecord(options) ? options : undefined);
}

function parseJournal(raw: string): RestoreJournal | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const { id, previous, cleanup } = value;
    if (typeof id !== "string" || !Array.isArray(previous) || !Array.isArray(cleanup)) return null;
    const changes = previous.map(parseSecretChange);
    if (changes.some((change) => change === null)) return null;
    if (!cleanup.every((key) => typeof key === "string")) return null;
    return { id, previous: changes as SecretChange[], cleanup: cleanup as string[] };
  } catch {
    return null;
  }
}

function parseSnapshot(raw: string | null): RestoreSnapshot | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.entries)) return null;
    const entries: StorageEntry[] = [];
    for (const entry of value.entries as unknown[]) {
      if (!Array.isArray(entry)) return null;
      const [key, stored] = entry as unknown[];
      if (typeof key !== "string" || (stored !== null && typeof stored !== "string")) return null;
      entries.push([key, stored]);
    }
    return { id: value.id, entries };
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

// The snapshot is removed before the journal at every step, so it never
// outlives the journal that tells whether to apply it.
async function finishRestore(journal: RestoreJournal): Promise<boolean> {
  await AsyncStorage.removeItem(RESTORE_SNAPSHOT_KEY);
  const results = await Promise.allSettled(journal.cleanup.map((key) => deleteSecret(key)));
  // Keep the journal so the next launch retries what could not be deleted.
  if (results.some((result) => result.status === "rejected")) {
    console.warn("Some credentials for removed service instances could not be cleared yet.");
    return false;
  }
  await deleteSecret(RESTORE_JOURNAL_KEY);
  await AsyncStorage.removeItem(RESTORE_COMMIT_KEY);
  return true;
}

async function undoRestore(journal: RestoreJournal): Promise<boolean> {
  const snapshot = parseSnapshot(await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY));
  // No snapshot means the app was killed before it was saved, so before the
  // settings batch started.
  if (snapshot?.id === journal.id) await writeEntries(snapshot.entries);
  await AsyncStorage.removeItem(RESTORE_SNAPSHOT_KEY);
  if (!(await putBackSecrets(journal.previous))) return false;
  await deleteSecret(RESTORE_JOURNAL_KEY);
  return true;
}

/**
 * Finish or undo a restore the app was killed in the middle of. Runs at launch
 * before any store reads storage, and before a new restore starts. Resolves
 * false while a restore is still pending because storage failed again.
 */
export async function recoverInterruptedRestore(): Promise<boolean> {
  try {
    const raw = await getSecret(RESTORE_JOURNAL_KEY);
    if (!raw) return true;
    const journal = parseJournal(raw);
    if (!journal) {
      await AsyncStorage.removeItem(RESTORE_SNAPSHOT_KEY);
      await deleteSecret(RESTORE_JOURNAL_KEY);
      return true;
    }
    if ((await AsyncStorage.getItem(RESTORE_COMMIT_KEY)) === journal.id) {
      return await finishRestore(journal);
    }
    return await undoRestore(journal);
  } catch (error) {
    console.warn("Could not recover an interrupted settings restore", error);
    return false;
  }
}

async function undoFailedRestore(
  snapshot: RestoreSnapshot,
  attempted: SecretChange[],
  settingsTouched: boolean,
): Promise<boolean> {
  try {
    if (settingsTouched) {
      // The marker may have landed even though its write reported an error.
      await AsyncStorage.removeItem(RESTORE_COMMIT_KEY);
      await writeEntries(snapshot.entries);
    }
    await AsyncStorage.removeItem(RESTORE_SNAPSHOT_KEY);
    if (!(await putBackSecrets(attempted))) return false;
    await deleteSecret(RESTORE_JOURNAL_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a restore all or nothing: the keychain `changes`, then the AsyncStorage
 * `entries` in one batch, then delete the `cleanup` keychain keys (credentials
 * of instances the restore replaced). A failure before the commit marker lands
 * puts everything back; being killed is handled by recoverInterruptedRestore.
 * `onCommit` runs right after the marker lands, before the cleanup, so the
 * caller can switch its in-memory state without waiting for the deletes.
 */
export async function persistRestore(
  changes: SecretChange[],
  entries: StorageEntry[],
  cleanup: string[],
  onCommit: () => void,
): Promise<void> {
  // A pending journal is the only record of what to put back, so it must not
  // be replaced.
  if (!(await recoverInterruptedRestore())) {
    throw new Error("The previous restore could not be finished or undone yet. Try again.");
  }
  const current = await Promise.all(changes.map(async ([key]) => getSecret(key)));
  const pending: SecretChange[] = [];
  const previous: SecretChange[] = [];
  changes.forEach(([key, value, options], index) => {
    if (value === current[index]) return;
    pending.push(secretChange(key, value, options));
    previous.push(secretChange(key, current[index], options));
  });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const journal: RestoreJournal = { id, previous, cleanup };
  const snapshot: RestoreSnapshot = {
    id,
    entries: entries.map(([key]) => [key, getString(key) ?? null]),
  };
  await setSecret(RESTORE_JOURNAL_KEY, JSON.stringify(journal), RESTORE_JOURNAL_OPTIONS);
  const attempted: SecretChange[] = [];
  let settingsTouched = false;
  try {
    await AsyncStorage.setItem(RESTORE_SNAPSHOT_KEY, JSON.stringify(snapshot));
    for (const [index, [key, value, options]] of pending.entries()) {
      attempted.push(previous[index]);
      if (value === null) await deleteSecret(key);
      else await setSecret(key, value, options);
    }
    settingsTouched = true;
    await writeEntries(entries);
    // Written on its own once every entry landed, so its presence proves the
    // whole batch is on disk.
    await AsyncStorage.setItem(RESTORE_COMMIT_KEY, id);
  } catch (error) {
    if (await undoFailedRestore(snapshot, attempted, settingsTouched)) throw error;
    // The journal stays, so the next launch puts the rest back.
    throw new Error(
      `${errorMessage(error)} Some previous settings could not be put back yet; the app will retry on its next launch.`,
    );
  }
  onCommit();
  // A failed cleanup leaves the journal for the next launch.
  await finishRestore(journal).catch((error) => {
    console.warn("Could not finish clearing replaced credentials", error);
  });
}

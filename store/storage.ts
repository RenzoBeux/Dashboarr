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

// Restore needs to observe native write errors before changing the live cache.
export async function persistMany(entries: [string, string][]): Promise<void> {
  const previous: [string, string][] = [];
  const missing: string[] = [];
  for (const [key] of entries) {
    const value = getString(key);
    if (value === undefined) missing.push(key);
    else previous.push([key, value]);
  }
  try {
    await AsyncStorage.multiSet(entries);
  } catch (error) {
    // The iOS implementation can report an error after writing some entries.
    try {
      if (previous.length > 0) await AsyncStorage.multiSet(previous);
      if (missing.length > 0) await AsyncStorage.multiRemove(missing);
    } catch {
      throw new Error("Could not restore the previous settings after a storage error.");
    }
    throw error;
  }
  for (const [key, value] of entries) cache[key] = value;
}

export type SecretChange = [
  key: string,
  value: string | null,
  options?: SecureStore.SecureStoreOptions,
];

export async function persistWithSecrets(
  changes: SecretChange[],
  commit: () => Promise<void>,
): Promise<void> {
  const previous = await Promise.all(changes.map(async ([key]) => getSecret(key)));
  const attempted: SecretChange[] = [];
  try {
    for (const [index, [key, value, options]] of changes.entries()) {
      if (value === previous[index]) continue;
      attempted.push([key, previous[index], options]);
      if (value === null) await deleteSecret(key);
      else await setSecret(key, value, options);
    }
    await commit();
  } catch (error) {
    const restored = await Promise.allSettled(
      attempted.map(async ([key, value, options]) => {
        if (await getSecret(key) === value) return;
        if (value === null) await deleteSecret(key);
        else await setSecret(key, value, options);
      }),
    );
    if (restored.some((result) => result.status === "rejected")) {
      throw new Error("Could not restore all previous credentials after a keychain error.");
    }
    throw error;
  }
}

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

export async function setSecret(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
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

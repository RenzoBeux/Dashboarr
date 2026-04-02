import { MMKV } from "react-native-mmkv";
import * as SecureStore from "expo-secure-store";

export const mmkv = new MMKV({ id: "dashboarr-config" });

// --- MMKV helpers (non-sensitive config) ---

export function getString(key: string): string | undefined {
  return mmkv.getString(key);
}

export function setString(key: string, value: string): void {
  mmkv.set(key, value);
}

export function getBoolean(key: string): boolean {
  return mmkv.getBoolean(key) ?? false;
}

export function setBoolean(key: string, value: boolean): void {
  mmkv.set(key, value);
}

export function deleteKey(key: string): void {
  mmkv.delete(key);
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

// --- JSON helpers for MMKV ---

export function getJSON<T>(key: string): T | undefined {
  const raw = mmkv.getString(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function setJSON(key: string, value: unknown): void {
  mmkv.set(key, JSON.stringify(value));
}

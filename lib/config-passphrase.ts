import * as SecureStore from "expo-secure-store";
import { getBoolean, setBoolean } from "@/store/storage";

const SECURE_KEY = "config.rememberedPassphrase";
// Non-secret flag, tracked in AsyncStorage so the UI can decide whether to
// offer "Use saved passphrase" without triggering a biometric prompt just
// to check for existence.
const FLAG_KEY = "app.hasRememberedPassphrase";

const WRITE_PROMPT = "Save backup passphrase for this device";
const READ_PROMPT = "Unlock saved backup passphrase";

export function hasRememberedPassphrase(): boolean {
  return getBoolean(FLAG_KEY);
}

export async function saveRememberedPassphrase(passphrase: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEY, passphrase, {
    requireAuthentication: true,
    authenticationPrompt: WRITE_PROMPT,
  });
  setBoolean(FLAG_KEY, true);
}

/**
 * Load the passphrase that was previously remembered on this device.
 * Triggers a biometric/passcode prompt. Returns null if the user cancels
 * auth, no passphrase was remembered, or the Keychain/Keystore entry has
 * been evicted (app reinstall on some Android setups, Keychain reset, etc.).
 */
export async function loadRememberedPassphrase(): Promise<string | null> {
  if (!hasRememberedPassphrase()) return null;
  try {
    const value = await SecureStore.getItemAsync(SECURE_KEY, {
      requireAuthentication: true,
      authenticationPrompt: READ_PROMPT,
    });
    if (!value) {
      // Flag said yes but the secure entry is gone — keep the flag honest.
      setBoolean(FLAG_KEY, false);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function forgetRememberedPassphrase(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEY);
  setBoolean(FLAG_KEY, false);
}

import * as Crypto from "expo-crypto";
import * as core from "@/lib/config-crypto-core";

/**
 * App-side binding of lib/config-crypto-core.ts with expo-crypto as the random
 * source. Same exports as before; the core is what the backend's web editor
 * bundles (with `crypto.getRandomValues`), so both sides run identical code
 * and produce byte-compatible envelopes.
 */

const rng: core.Rng = (n) => Crypto.getRandomBytes(n);

export { PBKDF2_ITERATIONS, isEncryptedEnvelope, deriveKeyHex, decryptEnvelope } from "@/lib/config-crypto-core";
export type { EncryptedEnvelope, DerivedKey, Rng } from "@/lib/config-crypto-core";

export function generateSaltHex(): string {
  return core.generateSaltHex(rng);
}

export function encryptJsonStringWithKey(plainJson: string, key: core.DerivedKey): core.EncryptedEnvelope {
  return core.encryptJsonStringWithKey(plainJson, key, rng);
}

export function encryptJsonString(plainJson: string, passphrase: string): Promise<core.EncryptedEnvelope> {
  return core.encryptJsonString(plainJson, passphrase, rng);
}

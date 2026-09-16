import * as core from "@/lib/config-crypto-core";

/**
 * Browser binding of the app's crypto core. Uses `crypto.getRandomValues`
 * only, which unlike `crypto.subtle` exists on plain-http LAN origins, and
 * runs the same @noble code the phone runs, so envelopes are interchangeable.
 */
const rng: core.Rng = (n) => crypto.getRandomValues(new Uint8Array(n));

export const { PBKDF2_ITERATIONS, isEncryptedEnvelope, deriveKeyHex, decryptEnvelope } = core;
export type { EncryptedEnvelope, DerivedKey } from "@/lib/config-crypto-core";

export function generateSaltHex(): string {
  return core.generateSaltHex(rng);
}

export function encryptWithKey(plainJson: string, key: core.DerivedKey): core.EncryptedEnvelope {
  return core.encryptJsonStringWithKey(plainJson, key, rng);
}

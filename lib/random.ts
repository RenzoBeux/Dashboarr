import * as Crypto from "expo-crypto";

/**
 * Random bytes, with one honest rule about the fallback.
 *
 * expo-crypto's native module is linked into every real build, so a throw from
 * `getRandomBytes` means the platform is broken, not that we should quietly
 * substitute `Math.random`. Under Jest the module genuinely isn't there, and
 * mocking it in every suite that transitively pulls in Digest auth or instance
 * ids is not worth it — so the insecure path is gated on the test environment
 * and nothing else. Callers that only need uniqueness (instance ids) can opt
 * into `insecureRandomBytes` explicitly.
 */

const IS_TEST = process.env.NODE_ENV === "test";

/** Uniform bytes from `Math.random`. Not for anything security-bearing. */
export function insecureRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = (Math.random() * 256) | 0;
  }
  return out;
}

/**
 * Cryptographically strong bytes. Throws if the platform cannot supply them,
 * rather than downgrading silently — outside Jest, where it falls back so
 * suites don't need a native mock.
 */
export function randomBytes(length: number): Uint8Array {
  try {
    const bytes = Crypto.getRandomBytes(length);
    if (bytes?.length === length) return bytes;
  } catch (err) {
    if (!IS_TEST) throw err;
    return insecureRandomBytes(length);
  }
  if (IS_TEST) return insecureRandomBytes(length);
  throw new Error(`expo-crypto returned no random bytes (${length} requested)`);
}

/** `randomBytes` as a lowercase hex string. */
export function randomHex(length: number): string {
  let out = "";
  for (const byte of randomBytes(length)) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

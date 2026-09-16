import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as Crypto from "expo-crypto";

const FORMAT = "dashboarr-encrypted-v1" as const;
// PBKDF2-SHA256 runs in pure JS on Hermes, which is much slower than native
// crypto. 100k is a mobile-practical balance — still adds ~17 bits of work
// against a brute-force attack on top of the 8+ char passphrase requirement.
export const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // AES-256
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12; // GCM standard
const MIN_PASSPHRASE_LENGTH = 8;
// Refuse to even attempt KDF on suspicious envelopes — protects against
// ~infinite iteration counts in a crafted file that would freeze the app.
const MAX_ITERATIONS = 10_000_000;
const MIN_ITERATIONS = 10_000;

export interface EncryptedEnvelope {
  format: typeof FORMAT;
  kdf: { name: "pbkdf2-sha256"; iterations: number; salt: string };
  cipher: { name: "aes-256-gcm"; nonce: string; ciphertext: string };
}

export function isEncryptedEnvelope(v: unknown): v is EncryptedEnvelope {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { format?: unknown }).format === FORMAT
  );
}

function assertIsEnvelope(v: unknown): asserts v is EncryptedEnvelope {
  if (!isEncryptedEnvelope(v)) throw new Error("Not an encrypted config file");
  const env = v as EncryptedEnvelope;
  if (env.kdf?.name !== "pbkdf2-sha256") throw new Error("Unsupported KDF");
  if (env.cipher?.name !== "aes-256-gcm") throw new Error("Unsupported cipher");
  if (typeof env.kdf.salt !== "string") throw new Error("Missing KDF salt");
  if (typeof env.cipher.nonce !== "string") throw new Error("Missing cipher nonce");
  if (typeof env.cipher.ciphertext !== "string") throw new Error("Missing ciphertext");
  if (
    typeof env.kdf.iterations !== "number" ||
    !Number.isInteger(env.kdf.iterations) ||
    env.kdf.iterations < MIN_ITERATIONS ||
    env.kdf.iterations > MAX_ITERATIONS
  ) {
    throw new Error("Invalid KDF iteration count");
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8ToBytes(passphrase), salt, {
    c: iterations,
    dkLen: KEY_LENGTH,
    // Default is 10ms; raising to 100ms means far fewer event-loop yields
    // during the hot PBKDF2 loop. Keeps the JS thread usable for the
    // occasional frame but cuts a big chunk of scheduler overhead.
    asyncTick: 100,
  });
}

/** Fresh random salt, hex-encoded, in the envelope's format. */
export function generateSaltHex(): string {
  return bytesToHex(Crypto.getRandomBytes(SALT_LENGTH));
}

/**
 * Runs the (slow) PBKDF2 step on its own so a caller can do it once and keep
 * the derived key for repeated encryptions — the backend backup upload does
 * this after every config change and must not spend seconds each time. The
 * result is exactly what `encryptJsonString` would derive for the same
 * passphrase + salt, so envelopes built from it stay file-compatible.
 */
export async function deriveKeyHex(
  passphrase: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  return bytesToHex(await deriveKey(passphrase, hexToBytes(saltHex), iterations));
}

export interface DerivedKey {
  saltHex: string;
  keyHex: string;
  iterations: number;
}

/**
 * Encrypts with a previously derived key. Synchronous: no KDF here, just a
 * fresh random nonce per call, which is what keeps key reuse across many
 * backups safe under AES-GCM. The envelope records the salt and iteration
 * count so `decryptEnvelope` (any device, the passphrase typed) works as
 * usual.
 */
export function encryptJsonStringWithKey(plainJson: string, key: DerivedKey): EncryptedEnvelope {
  if (!/^[0-9a-f]{64}$/.test(key.keyHex)) throw new Error("Invalid derived key");
  if (!/^[0-9a-f]{32}$/.test(key.saltHex)) throw new Error("Invalid salt");
  const nonce = Crypto.getRandomBytes(NONCE_LENGTH);
  const ciphertext = gcm(hexToBytes(key.keyHex), nonce).encrypt(utf8ToBytes(plainJson));
  return {
    format: FORMAT,
    kdf: { name: "pbkdf2-sha256", iterations: key.iterations, salt: key.saltHex },
    cipher: { name: "aes-256-gcm", nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext) },
  };
}

export async function encryptJsonString(
  plainJson: string,
  passphrase: string,
): Promise<EncryptedEnvelope> {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  const salt = Crypto.getRandomBytes(SALT_LENGTH);
  const nonce = Crypto.getRandomBytes(NONCE_LENGTH);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ciphertext = gcm(key, nonce).encrypt(utf8ToBytes(plainJson));
  return {
    format: FORMAT,
    kdf: { name: "pbkdf2-sha256", iterations: PBKDF2_ITERATIONS, salt: bytesToHex(salt) },
    cipher: { name: "aes-256-gcm", nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext) },
  };
}

export async function decryptEnvelope(
  envelope: unknown,
  passphrase: string,
): Promise<string> {
  assertIsEnvelope(envelope);
  const salt = hexToBytes(envelope.kdf.salt);
  const nonce = hexToBytes(envelope.cipher.nonce);
  const ciphertext = hexToBytes(envelope.cipher.ciphertext);
  const key = await deriveKey(passphrase, salt, envelope.kdf.iterations);
  let plaintext: Uint8Array;
  try {
    plaintext = gcm(key, nonce).decrypt(ciphertext);
  } catch {
    // AES-GCM throws on auth tag mismatch, i.e. wrong passphrase or tampered file.
    throw new Error("Incorrect passphrase or corrupted file");
  }
  return new TextDecoder().decode(plaintext);
}

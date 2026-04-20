import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as Crypto from "expo-crypto";

const FORMAT = "dashboarr-encrypted-v1" as const;
// PBKDF2-SHA256 runs in pure JS on Hermes, which is much slower than native
// crypto. 100k is a mobile-practical balance — still adds ~17 bits of work
// against a brute-force attack on top of the 8+ char passphrase requirement.
const PBKDF2_ITERATIONS = 100_000;
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

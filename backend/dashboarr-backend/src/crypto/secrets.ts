import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEnv } from "../env.js";

const FORMAT = "enc-v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer | null {
  if (cachedKey) return cachedKey;
  const { CONFIG_ENCRYPTION_KEY } = getEnv();
  if (!CONFIG_ENCRYPTION_KEY) return null;
  cachedKey = createHash("sha256").update(CONFIG_ENCRYPTION_KEY).digest();
  return cachedKey;
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(`${FORMAT}:`);
}

/**
 * Encrypt a secret string for storage in SQLite. Returns the original value
 * unchanged when CONFIG_ENCRYPTION_KEY is not configured — so the column
 * still round-trips in unencrypted deployments.
 */
export function encryptSecret(plaintext: string | null): string | null {
  if (plaintext === null || plaintext === "") return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  // Never double-encrypt. Shouldn't happen in practice but guards against
  // a future call-site mistake.
  if (isEncryptedValue(plaintext)) return plaintext;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT}:${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a value that may or may not be encrypted. Legacy plaintext rows
 * (written before CONFIG_ENCRYPTION_KEY was set) are passed through.
 *
 * Decryption failures — wrong key, tampered ciphertext, truncated column —
 * return null rather than throw. A service whose credentials can't be
 * decrypted will fail to poll, but the backend as a whole stays up.
 */
export function decryptSecret(value: string | null): string | null {
  if (value === null || value === "") return value;
  if (!isEncryptedValue(value)) return value;
  const key = getKey();
  if (!key) {
    // Encrypted value but no key configured — can't recover, but don't crash.
    return null;
  }
  const parts = value.split(":");
  if (parts.length !== 4) return null;
  const ivHex = parts[1];
  const tagHex = parts[2];
  const ctHex = parts[3];
  if (!ivHex || !tagHex || !ctHex) return null;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(ctHex, "hex");
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

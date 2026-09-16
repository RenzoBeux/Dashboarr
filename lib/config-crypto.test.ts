jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => {
    const out = new Uint8Array(n);
    require("crypto").randomFillSync(out);
    return out;
  },
}));

import {
  encryptJsonString,
  encryptJsonStringWithKey,
  decryptEnvelope,
  deriveKeyHex,
  generateSaltHex,
  isEncryptedEnvelope,
  PBKDF2_ITERATIONS,
  type EncryptedEnvelope,
} from "./config-crypto";

const samplePassphrase = "correct-horse-battery-staple";
const samplePayload = JSON.stringify({
  hello: "world",
  nested: { count: 42, list: [1, 2, 3] },
});

describe("isEncryptedEnvelope", () => {
  it("returns false for null", () => {
    expect(isEncryptedEnvelope(null)).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isEncryptedEnvelope(42)).toBe(false);
    expect(isEncryptedEnvelope("string")).toBe(false);
    expect(isEncryptedEnvelope(undefined)).toBe(false);
  });

  it("returns false for objects with the wrong format tag", () => {
    expect(isEncryptedEnvelope({ format: "other-format-v1" })).toBe(false);
    expect(isEncryptedEnvelope({})).toBe(false);
  });

  it("returns true for an object with the correct format tag", () => {
    expect(isEncryptedEnvelope({ format: "dashboarr-encrypted-v1" })).toBe(true);
  });
});

describe("encryptJsonString", () => {
  it("throws when passphrase is shorter than 8 chars", async () => {
    await expect(encryptJsonString(samplePayload, "short")).rejects.toThrow(/8/);
  });

  it("throws when passphrase is empty", async () => {
    await expect(encryptJsonString(samplePayload, "")).rejects.toThrow();
  });

  it("throws when passphrase is not a string", async () => {
    await expect(encryptJsonString(samplePayload, 12345 as any)).rejects.toThrow();
  });

  it("produces an envelope with the v1 format tag", async () => {
    const env = await encryptJsonString(samplePayload, samplePassphrase);
    expect(env.format).toBe("dashboarr-encrypted-v1");
  });

  it("produces an envelope with hex salt, nonce, and ciphertext", async () => {
    const env = await encryptJsonString(samplePayload, samplePassphrase);
    expect(env.kdf.salt).toMatch(/^[0-9a-f]+$/);
    expect(env.cipher.nonce).toMatch(/^[0-9a-f]+$/);
    expect(env.cipher.ciphertext).toMatch(/^[0-9a-f]+$/);
    // 16-byte salt = 32 hex chars; 12-byte nonce = 24 hex chars
    expect(env.kdf.salt).toHaveLength(32);
    expect(env.cipher.nonce).toHaveLength(24);
  });

  it("uses pbkdf2-sha256 KDF and aes-256-gcm cipher", async () => {
    const env = await encryptJsonString(samplePayload, samplePassphrase);
    expect(env.kdf.name).toBe("pbkdf2-sha256");
    expect(env.kdf.iterations).toBe(100_000);
    expect(env.cipher.name).toBe("aes-256-gcm");
  });

  it("two encryptions of the same plaintext produce different ciphertexts", async () => {
    const a = await encryptJsonString(samplePayload, samplePassphrase);
    const b = await encryptJsonString(samplePayload, samplePassphrase);
    expect(a.cipher.ciphertext).not.toBe(b.cipher.ciphertext);
    expect(a.cipher.nonce).not.toBe(b.cipher.nonce);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
  });
});

describe("decryptEnvelope", () => {
  let env: EncryptedEnvelope;

  beforeAll(async () => {
    env = await encryptJsonString(samplePayload, samplePassphrase);
  });

  it("round-trips JSON content (decrypt(encrypt(x)) === x)", async () => {
    const out = await decryptEnvelope(env, samplePassphrase);
    expect(JSON.parse(out)).toEqual(JSON.parse(samplePayload));
  });

  it("throws on wrong passphrase (GCM auth-tag failure)", async () => {
    await expect(decryptEnvelope(env, "wrong-passphrase")).rejects.toThrow(
      /incorrect passphrase|corrupted/i,
    );
  });

  it("throws when given a non-envelope value", async () => {
    await expect(decryptEnvelope({}, samplePassphrase)).rejects.toThrow();
    await expect(decryptEnvelope(null, samplePassphrase)).rejects.toThrow();
  });

  it("throws when iterations is below MIN_ITERATIONS (DoS-crafted envelope)", async () => {
    const bad = { ...env, kdf: { ...env.kdf, iterations: 5_000 } };
    await expect(decryptEnvelope(bad, samplePassphrase)).rejects.toThrow(
      /iteration/i,
    );
  });

  it("throws when iterations is above MAX_ITERATIONS (freeze-the-app guard)", async () => {
    const bad = { ...env, kdf: { ...env.kdf, iterations: 50_000_000 } };
    await expect(decryptEnvelope(bad, samplePassphrase)).rejects.toThrow(
      /iteration/i,
    );
  });

  it("throws when ciphertext is corrupted by one byte (auth-tag mismatch)", async () => {
    // Flip the last hex char of the ciphertext so the auth tag fails.
    const last = env.cipher.ciphertext.slice(-1);
    const flipped = last === "f" ? "0" : "f";
    const bad = {
      ...env,
      cipher: {
        ...env.cipher,
        ciphertext: env.cipher.ciphertext.slice(0, -1) + flipped,
      },
    };
    await expect(decryptEnvelope(bad, samplePassphrase)).rejects.toThrow(
      /incorrect passphrase|corrupted/i,
    );
  });

  it("throws when KDF name is not pbkdf2-sha256", async () => {
    const bad = { ...env, kdf: { ...env.kdf, name: "scrypt" as any } };
    await expect(decryptEnvelope(bad, samplePassphrase)).rejects.toThrow(/KDF/i);
  });

  it("throws when cipher name is not aes-256-gcm", async () => {
    const bad = { ...env, cipher: { ...env.cipher, name: "chacha20" as any } };
    await expect(decryptEnvelope(bad, samplePassphrase)).rejects.toThrow(/cipher/i);
  });
});

describe("derived-key reuse (backend backup)", () => {
  // The backend upload derives once and encrypts many times; every envelope it
  // produces must still open with the plain passphrase path on another phone.
  it("deriveKeyHex is deterministic per salt and differs across salts", async () => {
    const salt = generateSaltHex();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    const a = await deriveKeyHex(samplePassphrase, salt, 10_000);
    const b = await deriveKeyHex(samplePassphrase, salt, 10_000);
    const c = await deriveKeyHex(samplePassphrase, generateSaltHex(), 10_000);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("rejects short passphrases like the file path does", async () => {
    await expect(deriveKeyHex("short", generateSaltHex(), 10_000)).rejects.toThrow(/at least 8/);
  });

  it("envelopes built with a cached key decrypt with the passphrase", async () => {
    const saltHex = generateSaltHex();
    const keyHex = await deriveKeyHex(samplePassphrase, saltHex, 10_000);
    const env = encryptJsonStringWithKey(samplePayload, { saltHex, keyHex, iterations: 10_000 });
    expect(isEncryptedEnvelope(env)).toBe(true);
    expect(env.kdf.salt).toBe(saltHex);
    expect(env.kdf.iterations).toBe(10_000);
    expect(await decryptEnvelope(env, samplePassphrase)).toBe(samplePayload);
    await expect(decryptEnvelope(env, "wrong-passphrase")).rejects.toThrow(/Incorrect passphrase/);
  });

  it("uses a fresh nonce per call so ciphertexts never repeat", async () => {
    const saltHex = generateSaltHex();
    const keyHex = await deriveKeyHex(samplePassphrase, saltHex, 10_000);
    const key = { saltHex, keyHex, iterations: PBKDF2_ITERATIONS };
    const a = encryptJsonStringWithKey(samplePayload, key);
    const b = encryptJsonStringWithKey(samplePayload, key);
    expect(a.cipher.nonce).not.toBe(b.cipher.nonce);
    expect(a.cipher.ciphertext).not.toBe(b.cipher.ciphertext);
  });

  it("refuses malformed key material", () => {
    expect(() =>
      encryptJsonStringWithKey(samplePayload, { saltHex: generateSaltHex(), keyHex: "ab".repeat(31), iterations: 10_000 }),
    ).toThrow(/Invalid derived key/);
    expect(() =>
      encryptJsonStringWithKey(samplePayload, { saltHex: "zz", keyHex: "ab".repeat(32), iterations: 10_000 }),
    ).toThrow(/Invalid salt/);
  });
});

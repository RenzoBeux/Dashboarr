import { expect, test } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { decryptEnvelope, encryptJsonStringWithKey, deriveKeyHex, isEncryptedEnvelope } from "@/lib/config-crypto-core";
import type { EncryptedEnvelope } from "@/lib/config-crypto-core";

// Produced once by the app's @noble implementation with a fixed salt and nonce.
// The web editor bundles the same core this test imports,
// so a passing round-trip here is the interop proof; the WebCrypto path below
// additionally shows the format is plain PBKDF2-SHA256 + AES-256-GCM.
const fixture = JSON.parse(readFileSync(new URL("../../../src/ui/envelope-fixture.json", import.meta.url), "utf8")) as {
  passphrase: string;
  plaintext: string;
  envelope: EncryptedEnvelope;
};

const rng = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

test("the shared core decrypts the app-generated fixture", async () => {
  expect(isEncryptedEnvelope(fixture.envelope)).toBe(true);
  expect(await decryptEnvelope(fixture.envelope, fixture.passphrase)).toBe(fixture.plaintext);
  await expect(decryptEnvelope(fixture.envelope, "wrong-passphrase")).rejects.toThrow(/Incorrect passphrase/);
});

test("Node's WebCrypto opens the same envelope: the format is standard", async () => {
  const { kdf, cipher } = fixture.envelope;
  const base = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(fixture.passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unhex(kdf.salt), iterations: kdf.iterations },
    base,
    256,
  );
  const key = await webcrypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
  const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: unhex(cipher.nonce) }, key, unhex(cipher.ciphertext));
  expect(new TextDecoder().decode(plain)).toBe(fixture.plaintext);
});

test("a cached derived key encrypts an envelope the passphrase path opens, with a fresh nonce", async () => {
  const keyHex = await deriveKeyHex(fixture.passphrase, fixture.envelope.kdf.salt, fixture.envelope.kdf.iterations);
  const env = encryptJsonStringWithKey(fixture.plaintext, { saltHex: fixture.envelope.kdf.salt, keyHex, iterations: fixture.envelope.kdf.iterations }, rng);
  expect(env.cipher.nonce).not.toBe(fixture.envelope.cipher.nonce);
  expect(hex(unhex(env.cipher.nonce)).length).toBe(24);
  expect(await decryptEnvelope(env, fixture.passphrase)).toBe(fixture.plaintext);
});

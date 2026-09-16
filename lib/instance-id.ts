/**
 * Stable instance identifier (ServiceInstance.id, dashboard ids, widget slot
 * ids). Pure on purpose: this module is bundled into the backend's web editor
 * as well as the app, so it must not import expo-crypto. The app registers
 * expo-crypto's native randomUUID through `setInstanceIdGenerator` (see
 * lib/uuid.ts); everywhere else the WebCrypto / Node `crypto` global is used,
 * and a Math.random v4 covers environments with neither (Jest). Uniqueness is
 * all this needs — nothing here is security-bearing.
 */

export type IdGenerator = () => string;

let registered: IdGenerator | null = null;

export function setInstanceIdGenerator(fn: IdGenerator | null): void {
  registered = fn;
}

export function generateInstanceId(): string {
  if (registered) {
    const id = registered();
    if (typeof id === "string" && id.length > 0) return id;
  }
  const g = globalThis.crypto as Crypto | undefined;
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") {
    g.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = (Math.random() * 256) | 0;
  }
  return formatV4(bytes);
}

function formatV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

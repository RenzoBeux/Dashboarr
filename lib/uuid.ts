import * as Crypto from "expo-crypto";

// Stable instance identifier. Used as a key for ServiceInstance entries and
// for the SecureStore secrets keyed per-instance. Falls back to a Math.random
// UUID when expo-crypto's native module isn't available (e.g. inside Jest),
// so unit tests for the migration chain don't have to mock it.
export function generateInstanceId(): string {
  const native = Crypto.randomUUID?.();
  if (typeof native === "string" && native.length > 0) return native;
  return fallbackUuid();
}

// RFC4122-style v4 UUID using Math.random — collision probability is fine for
// our scale (a handful of instances per device) and we only hit this path in
// non-native environments.
function fallbackUuid(): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(((Math.random() * 256) | 0).toString(16).padStart(2, "0"));
  }
  hex[6] = (((parseInt(hex[6], 16) & 0x0f) | 0x40) & 0xff).toString(16).padStart(2, "0");
  hex[8] = (((parseInt(hex[8], 16) & 0x3f) | 0x80) & 0xff).toString(16).padStart(2, "0");
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

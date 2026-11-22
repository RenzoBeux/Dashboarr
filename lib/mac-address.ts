/**
 * MAC address parsing shared by the Wake-on-LAN sender and the config schema.
 * Pure on purpose: store/config-schema.ts imports it, and that module is also
 * bundled into the backend's web editor.
 *
 * Accepts ':', '-', '.' or whitespace separators, or none. Returns the six
 * bytes, or null when the value is not exactly twelve hex digits.
 */
export function parseMacBytes(mac: string): number[] | null {
  const clean = mac.replace(/[:\-.\s]/g, "").toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(clean)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < 12; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

export function isValidMac(mac: string): boolean {
  return parseMacBytes(mac) !== null;
}

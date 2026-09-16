/**
 * Pure SSID/BSSID matching shared by the network evaluator (lib/network.ts)
 * and the per-instance URL resolver in the config store. No imports so the
 * store can use it without pulling in NetInfo, and lib/network.ts can use it
 * without creating a store → network import cycle.
 */

/** The WiFi network the device is on right now, as NetInfo reports it. */
export interface WifiIdentity {
  ssid: string;
  /** AP MAC address, lowercase. Empty when the OS/build doesn't surface it. */
  bssid: string;
}

/** Minimal shape of a home-network entry needed for matching. */
export interface HomeNetworkMatchTarget {
  ssid: string;
  bssid: string;
}

/**
 * True only when `wifi` is one of `homeNetworks`: the SSID must match, and a
 * pinned BSSID must also match (fails closed if the OS hides the BSSID, which
 * guards against a rogue AP cloning the SSID). `null` (not on WiFi, or the SSID
 * is masked by a VPN) never matches, which is the safe default.
 */
export function matchesHomeNetwork(
  wifi: WifiIdentity | null,
  homeNetworks: readonly HomeNetworkMatchTarget[],
): boolean {
  if (!wifi) return false;
  const ssid = wifi.ssid;
  const bssid = wifi.bssid;
  return homeNetworks.some((n) => {
    if (n.ssid !== ssid) return false;
    if (!n.bssid) return true;
    if (!bssid) return false;
    return n.bssid === bssid;
  });
}

/** Structural equality so the store's setter can no-op on NetInfo's repeats. */
export function sameWifiIdentity(
  a: WifiIdentity | null,
  b: WifiIdentity | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.ssid === b.ssid && a.bssid === b.bssid;
}

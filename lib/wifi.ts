import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Platform } from "react-native";

// NetInfo defaults `shouldFetchWiFiSSID` to false on iOS (privacy — fetching
// SSID triggers the location-services indicator). Without this, NetInfo
// returns null SSID even with the wifi-info entitlement and Location granted.
NetInfo.configure({ shouldFetchWiFiSSID: true });

export interface WifiIdentity {
  ssid: string;
  /** AP MAC address. Used as a secondary check in auto-switch so a rogue AP
   *  with a cloned SSID can't trick the app into sending local-URL traffic.
   *  Empty string when NetInfo doesn't surface it on this platform/build. */
  bssid: string;
}

export async function detectWifi(): Promise<WifiIdentity | null> {
  // Both Android and iOS require Location permission to read WiFi SSID/BSSID.
  // On iOS this also needs the `com.apple.developer.networking.wifi-info`
  // entitlement (set in app.config.ts → ios.entitlements).
  if (Platform.OS === "android" || Platform.OS === "ios") {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
  }

  const state = await NetInfo.fetch();
  if (state.type !== "wifi" || !state.details?.ssid) return null;
  return {
    ssid: state.details.ssid,
    bssid: typeof state.details.bssid === "string" ? state.details.bssid.toLowerCase() : "",
  };
}

/** Back-compat wrapper. Prefer `detectWifi` for new callers. */
export async function detectSSID(): Promise<string | null> {
  const wifi = await detectWifi();
  return wifi?.ssid ?? null;
}

export function normalizeBssid(value: string): string {
  return value.trim().toLowerCase();
}

// Permissive MAC charset — accepts colon/dash/dot separators and hex. We only
// guard against obviously-wrong input; NetInfo's BSSID format varies by OS.
const HOME_NETWORK_MAC_RE = /^[0-9a-f:.\-]+$/i;

/** Minimal shape a home-network entry needs for validation — kept structural so
 *  this module doesn't import the store (avoids a needless dependency). */
interface HomeNetworkLike {
  id: string;
  ssid: string;
  bssid: string;
}

export type HomeNetworkValidation =
  | { ok: true; ssid: string; bssid: string }
  | { ok: false; error: string };

/**
 * Validate + normalize a home-network form entry. Shared by the global Home
 * Networks screen and the per-dashboard override editor (#148) so both apply
 * identical rules: SSID required (≤64 chars), optional MAC-shaped BSSID (≤64),
 * and no exact (ssid, bssid) duplicate within `existing` (the entry being
 * edited, identified by `editingId`, is excluded). Returns the normalized
 * values on success so callers persist exactly what was validated.
 */
export function validateHomeNetworkInput(
  rawSsid: string,
  rawBssid: string,
  existing: readonly HomeNetworkLike[],
  editingId?: string | null,
): HomeNetworkValidation {
  const ssid = rawSsid.trim();
  if (!ssid) return { ok: false, error: "WiFi name (SSID) is required" };
  if (ssid.length > 64) return { ok: false, error: "WiFi name is too long" };

  const trimmedBssid = rawBssid.trim();
  if (trimmedBssid && !HOME_NETWORK_MAC_RE.test(trimmedBssid)) {
    return {
      ok: false,
      error: "BSSID looks invalid — use a MAC like aa:bb:cc:dd:ee:ff",
    };
  }
  if (trimmedBssid.length > 64) return { ok: false, error: "BSSID is too long" };

  const bssid = normalizeBssid(trimmedBssid);
  const duplicate = existing.some(
    (n) => n.id !== editingId && n.ssid === ssid && n.bssid === bssid,
  );
  if (duplicate) return { ok: false, error: "This network is already saved" };

  return { ok: true, ssid, bssid };
}

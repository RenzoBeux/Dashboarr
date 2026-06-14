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

export interface WifiPermissionState {
  /** Location permission is granted, so SSID/BSSID reads will work. */
  granted: boolean;
  /** False once the OS will no longer surface the permission prompt (on iOS,
   *  after the user denies it the first time). The UI uses this to offer "Open
   *  Settings" instead of a re-request that would silently resolve to denied. */
  canAskAgain: boolean;
}

/** Current Location-permission state, read WITHOUT prompting. */
export async function getWifiPermissionStatus(): Promise<WifiPermissionState> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return { granted: true, canAskAgain: false };
  }
  const { status, canAskAgain } =
    await Location.getForegroundPermissionsAsync();
  return { granted: status === "granted", canAskAgain };
}

/**
 * Ensure Location permission (needed to read the WiFi SSID for home-network
 * detection). Prompts once if the OS still allows it; never loops. Returns the
 * resulting state so callers can fall back to opening system Settings when the
 * OS has hard-denied — the #168 recovery path: a freshly set-up device that
 * dismissed the one-shot post-import prompt otherwise has no way to confirm home
 * (and thus no way back to local URLs) short of reinstalling.
 */
export async function ensureWifiPermission(): Promise<WifiPermissionState> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return { granted: true, canAskAgain: false };
  }
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === "granted") {
    return { granted: true, canAskAgain: false };
  }
  if (!current.canAskAgain) return { granted: false, canAskAgain: false };
  const next = await Location.requestForegroundPermissionsAsync();
  return { granted: next.status === "granted", canAskAgain: next.canAskAgain };
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

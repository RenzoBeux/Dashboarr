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

// Warm-up tuning for the iOS netinfo SSID-null-after-grant bug (#168): right
// after Location permission is FIRST granted, the next NetInfo.fetch() returns a
// null SSID until the WiFi re-associates or the app restarts. NetInfo.refresh()
// force-refreshes the singleton; a few retries outlast the brief window where
// the OS hasn't surfaced the SSID yet. User-initiated/one-shot, so ~1.2s worst
// case is fine — the steady-state poll never runs this.
const WIFI_REFRESH_ATTEMPTS = 4;
const WIFI_REFRESH_DELAY_MS = 400;

/** Injectable so tests pass a no-op instead of waiting real time. */
type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/**
 * Force-refresh NetInfo's global singleton and poll until the WiFi SSID is
 * readable, working around the netinfo iOS bug where the SSID stays null on the
 * first read right after Location permission is first granted, until the WiFi
 * re-associates or the app restarts (#168). Returns the identity once the SSID
 * surfaces, or null if it never does within the budget (caller stays "away" →
 * remote, the honest result). Assumes Location permission is already granted —
 * does NOT prompt (callers prompt first via detectWifi / ensureWifiPermission).
 *
 * Side effect: leaves the singleton warm, so a subsequent NetInfo.fetch()
 * elsewhere (evaluateHomeNetwork's own fetch) reads the surfaced SSID too.
 */
export async function refreshWifiIdentity(
  sleep: Sleep = realSleep,
): Promise<WifiIdentity | null> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  for (let attempt = 0; attempt < WIFI_REFRESH_ATTEMPTS; attempt++) {
    // refresh() resolves with the same state the next fetch() would return, so
    // read it directly and skip a redundant native round-trip per attempt.
    const state = await NetInfo.refresh();
    if (state.type === "wifi" && state.details?.ssid) {
      return {
        ssid: state.details.ssid,
        bssid:
          typeof state.details.bssid === "string"
            ? state.details.bssid.toLowerCase()
            : "",
      };
    }
    // Not on WiFi at all → no amount of retrying surfaces an SSID; bail fast so
    // cellular/away callers don't wait out the whole budget.
    if (state.type !== "wifi") return null;
    if (attempt < WIFI_REFRESH_ATTEMPTS - 1) await sleep(WIFI_REFRESH_DELAY_MS);
  }
  return null;
}

/**
 * Like `detectWifi`, but works around the post-grant null-SSID bug (#168):
 * prompts for Location, then refresh+retries until the SSID surfaces. Use on
 * user-initiated recovery paths (config import, manual "detect", grant). The
 * cheap single-fetch `detectWifi` stays for the steady-state poll.
 */
export async function detectWifiWithRefresh(
  sleep?: Sleep,
): Promise<WifiIdentity | null> {
  if (Platform.OS === "android" || Platform.OS === "ios") {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
  }
  return refreshWifiIdentity(sleep);
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

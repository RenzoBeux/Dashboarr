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

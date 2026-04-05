import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Platform } from "react-native";

export async function detectSSID(): Promise<string | null> {
  // Android requires location permission to read WiFi SSID
  if (Platform.OS === "android") {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
  }

  const state = await NetInfo.fetch();
  if (state.type === "wifi" && state.details?.ssid) {
    return state.details.ssid;
  }
  return null;
}

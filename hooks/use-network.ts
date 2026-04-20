import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS } from "@/lib/constants";

/**
 * Auto-switches all services between local/remote URLs based on WiFi identity.
 * When on the configured home network → local URLs, otherwise → remote URLs.
 *
 * Matching rules:
 *   - If `homeBSSID` is set: require BOTH homeSSID and homeBSSID to match.
 *     A rogue AP with a cloned SSID but different BSSID will not pass.
 *   - If `homeBSSID` is empty (legacy / SSID-only): SSID match is sufficient
 *     (old behavior for backups made before v6).
 */
export function useNetworkAutoSwitch() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeSSID = useConfigStore((s) => s.homeSSID);
  const homeBSSID = useConfigStore((s) => s.homeBSSID);
  const updateService = useConfigStore((s) => s.updateService);

  useEffect(() => {
    if (!autoSwitchNetwork || !homeSSID) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.type !== "wifi" || !state.details) {
        // Not on WiFi — treat as "not home", use remote URLs.
        for (const id of SERVICE_IDS) updateService(id, { useRemote: true });
        return;
      }

      const ssidMatch = state.details.ssid === homeSSID;
      const currentBssid =
        typeof state.details.bssid === "string" ? state.details.bssid.toLowerCase() : "";
      const bssidMatch = homeBSSID ? currentBssid === homeBSSID : true;
      const isHome = ssidMatch && bssidMatch;

      for (const id of SERVICE_IDS) {
        updateService(id, { useRemote: !isHome });
      }
    });

    return unsubscribe;
  }, [autoSwitchNetwork, homeSSID, homeBSSID, updateService]);
}

import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS } from "@/lib/constants";

/**
 * Auto-switches all services between local/remote URLs based on WiFi identity.
 * Any configured `homeNetwork` entry that matches the live (ssid, bssid) → home.
 *
 * Per-entry matching:
 *   - SSID must match exactly.
 *   - If the entry has an empty `bssid`, SSID alone is enough.
 *   - If the entry has a `bssid` set, it must match the live BSSID. If the OS
 *     doesn't surface a BSSID on this build, the pinned entry fails closed —
 *     don't trust local URLs without the AP fingerprint we asked for.
 */
export function useNetworkAutoSwitch() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeNetworks = useConfigStore((s) => s.homeNetworks);
  const updateService = useConfigStore((s) => s.updateService);

  useEffect(() => {
    if (!autoSwitchNetwork || homeNetworks.length === 0) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.type !== "wifi" || !state.details) {
        for (const id of SERVICE_IDS) updateService(id, { useRemote: true });
        return;
      }

      const currentSsid = state.details.ssid ?? "";
      const currentBssid =
        typeof state.details.bssid === "string" ? state.details.bssid.toLowerCase() : "";

      const isHome = homeNetworks.some((n) => {
        if (n.ssid !== currentSsid) return false;
        if (!n.bssid) return true;
        if (!currentBssid) return false;
        return n.bssid === currentBssid;
      });

      for (const id of SERVICE_IDS) {
        updateService(id, { useRemote: !isHome });
      }
    });

    return unsubscribe;
  }, [autoSwitchNetwork, homeNetworks, updateService]);
}

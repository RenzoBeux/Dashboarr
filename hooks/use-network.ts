import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS } from "@/lib/constants";

/**
 * Auto-switches all services between local/remote URLs based on WiFi SSID.
 * When on the configured home network → local URLs, otherwise → remote URLs.
 */
export function useNetworkAutoSwitch() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeSSID = useConfigStore((s) => s.homeSSID);
  const updateService = useConfigStore((s) => s.updateService);

  useEffect(() => {
    if (!autoSwitchNetwork || !homeSSID) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const isHome =
        state.type === "wifi" && state.details?.ssid === homeSSID;

      for (const id of SERVICE_IDS) {
        updateService(id, { useRemote: !isHome });
      }
    });

    return unsubscribe;
  }, [autoSwitchNetwork, homeSSID, updateService]);
}

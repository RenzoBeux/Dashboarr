import { useEffect, useRef } from "react";
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
 *
 * Writes only on transition: NetInfo fires events frequently (esp. on Android
 * during app resume, screen-on, etc.). Writing useRemote on every event would
 * clobber a user's manual override within seconds. We track the last applied
 * isHome and only call updateService when it flips — including the initial
 * subscribe, which intentionally seeds the ref without writing so the user's
 * persisted choice survives app launch.
 */
export function useNetworkAutoSwitch() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeNetworks = useConfigStore((s) => s.homeNetworks);
  const updateService = useConfigStore((s) => s.updateService);
  const lastIsHomeRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!autoSwitchNetwork || homeNetworks.length === 0) {
      lastIsHomeRef.current = null;
      return;
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      let isHome: boolean;
      if (state.type !== "wifi" || !state.details) {
        isHome = false;
      } else {
        const currentSsid = state.details.ssid ?? "";
        const currentBssid =
          typeof state.details.bssid === "string"
            ? state.details.bssid.toLowerCase()
            : "";
        isHome = homeNetworks.some((n) => {
          if (n.ssid !== currentSsid) return false;
          if (!n.bssid) return true;
          if (!currentBssid) return false;
          return n.bssid === currentBssid;
        });
      }

      // First event after subscribe: seed the ref without writing. The user's
      // persisted useRemote stays in effect until the network *changes*.
      if (lastIsHomeRef.current === null) {
        lastIsHomeRef.current = isHome;
        return;
      }
      if (lastIsHomeRef.current === isHome) return;
      lastIsHomeRef.current = isHome;
      for (const id of SERVICE_IDS) {
        updateService(id, { useRemote: !isHome });
      }
    });

    return () => {
      unsubscribe();
      lastIsHomeRef.current = null;
    };
  }, [autoSwitchNetwork, homeNetworks, updateService]);
}

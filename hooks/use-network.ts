import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";

/**
 * Tracks whether the phone is on a configured home network and writes the
 * result to `networkAwayFromHome` in the config store. The URL resolver
 * combines that runtime flag with the per-instance `useRemote` *user
 * override* — so the user's "always use remote" toggle never gets clobbered
 * by network events, and the situational auto-switch still flips URLs
 * transparently as the user moves between networks.
 *
 * Home-network matching:
 *   - SSID must match exactly.
 *   - If the entry has an empty `bssid`, SSID alone is enough.
 *   - If the entry has a `bssid` set, it must match the live BSSID. If the OS
 *     doesn't surface a BSSID on this build, the pinned entry fails closed —
 *     don't trust local URLs without the AP fingerprint we asked for.
 */
export function useNetworkAutoSwitch() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeNetworks = useConfigStore((s) => s.homeNetworks);
  const setNetworkAwayFromHome = useConfigStore((s) => s.setNetworkAwayFromHome);

  useEffect(() => {
    if (!autoSwitchNetwork || homeNetworks.length === 0) return;

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
      // Setter is a no-op when the value hasn't changed, so NetInfo's chatty
      // event stream doesn't cause spurious store updates / re-renders.
      setNetworkAwayFromHome(!isHome);
    });

    return unsubscribe;
  }, [autoSwitchNetwork, homeNetworks, setNetworkAwayFromHome]);
}

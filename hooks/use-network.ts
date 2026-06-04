import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import { evaluateHomeNetwork } from "@/lib/network";

/**
 * Keeps the store's ephemeral `networkAwayFromHome` flag in sync with the actual
 * network, which drives local/remote URL selection (see lib/network.ts). Local
 * URLs are used only on a confirmed home network; everywhere else the app uses
 * remote (never the private local URL, which would leak the API key to a
 * stranger's device on an untrusted LAN).
 *
 * Triggers:
 *   - eager evaluation on mount — fixes the stale cold-start state behind #106
 *     (the old code only attached a listener and waited for NetInfo's first
 *     event, so the first requests ran against last session's flag).
 *   - debounced evaluation on every NetInfo change — collapses the burst of
 *     events a single network transition emits.
 *   - app-resume evaluation is wired in app/_layout.tsx's onAppStateChange, since
 *     a VPN can be toggled while the JS runtime is suspended (no event delivered).
 */
export function useNetworkAutoSwitch() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeNetworks = useConfigStore((s) => s.homeNetworks);

  useEffect(() => {
    // Auto-switch off → the flag is ignored by getActiveUrl; nothing to do.
    if (!autoSwitchNetwork) return;

    // No home networks → we can never confirm "home", so force the safe default
    // (away → remote) rather than leaving a stale "home" flag that would use the
    // private local URL off-network. The Home Networks screen warns the user.
    if (homeNetworks.length === 0) {
      useConfigStore.getState().setNetworkAwayFromHome(true);
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const evaluate = () => void evaluateHomeNetwork();
    const scheduleEvaluate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(evaluate, 800);
    };

    evaluate(); // eager startup evaluation
    const unsubscribe = NetInfo.addEventListener(scheduleEvaluate);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [autoSwitchNetwork, homeNetworks]);
}

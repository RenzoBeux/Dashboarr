import { useEffect } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import {
  evaluateHomeNetwork,
  resolveEffectiveHomeNetworks,
} from "@/lib/network";
import { detectVpnActive } from "@/lib/vpn";

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
  // Re-evaluate whenever the global list changes OR the active dashboard's
  // selection changes (#148). Both are raw store refs, so they stay stable
  // until actually mutated; switching workspaces changes activeDashboardId —
  // and so the selected `overrideIds` ref — which re-runs the effect. We depend
  // on these inputs rather than the resolved list, since resolving a custom
  // subset allocates a new array every render and would loop the effect.
  const globalHomeNetworks = useConfigStore((s) => s.homeNetworks);
  const overrideIds = useConfigStore(
    (s) => s.dashboards.find((d) => d.id === s.activeDashboardId)?.homeNetworkIds,
  );
  // VPN-as-home (#185) changes what "home" means — re-evaluate on toggle, and
  // keep listening even with zero configured SSIDs (the VPN check alone can
  // confirm home then).
  const treatVpnAsHome = useConfigStore((s) => s.treatVpnAsHome);

  // Always-on WiFi-vs-not + VPN tracker, independent of auto-switch. The
  // off-WiFi LAN guard in lib/http-client needs to know whether we're on WiFi
  // even when auto-switch is off (a LAN URL is then used regardless of network,
  // and on cellular it hangs — freezing the whole health grid red, the
  // Glances/#106 report) — and whether a VPN is up, which makes that same LAN
  // URL reachable after all (#185). NetInfo can't see the VPN itself, but
  // toggling one changes the default network, so its events are the right
  // moments to re-run the native check. Eager fetch + listener so both are
  // accurate by the first probe.
  useEffect(() => {
    const apply = (state: NetInfoState) => {
      const store = useConfigStore.getState();
      store.setIsOnWifi(state.type === "wifi");
      store.setIsVpnActive(detectVpnActive());
    };
    void NetInfo.fetch().then(apply).catch(() => {});
    const unsubscribe = NetInfo.addEventListener(apply);
    // Liveness re-check: on iOS a tunnel dying over WiFi emits NO NetInfo
    // event (its SCNetworkReachability backend maps VPN-up and VPN-down to the
    // same "wifi" state), so without this a silent VPN drop would leave the
    // guard down — and with treatVpnAsHome, keep serving local URLs on
    // whatever network the device is actually on. The native check is a cheap
    // sync call; setIsVpnActive no-ops when unchanged.
    const vpnLiveness = setInterval(() => {
      const store = useConfigStore.getState();
      const live = detectVpnActive();
      if (live !== store.isVpnActive) {
        store.setIsVpnActive(live);
        void evaluateHomeNetwork();
      }
    }, 15000);
    return () => {
      clearInterval(vpnLiveness);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Auto-switch off → the flag is ignored by getActiveUrl; nothing to do.
    if (!autoSwitchNetwork) return;

    // No effective home networks (none configured, or an empty custom
    // selection) → we can never confirm "home" by SSID, so force the safe
    // default (away → remote) rather than leaving a stale "home" flag that
    // would use the private local URL off-network. The Home Networks screen
    // warns the user. With treatVpnAsHome on, fall through instead: the VPN
    // check can still confirm home, so we must evaluate and keep listening.
    const { dashboards, activeDashboardId, homeNetworks } =
      useConfigStore.getState();
    const effective = resolveEffectiveHomeNetworks(
      dashboards,
      activeDashboardId,
      homeNetworks,
    );
    if (effective.length === 0 && !treatVpnAsHome) {
      useConfigStore.getState().setNetworkAwayFromHome(true);
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const evaluate = () => void evaluateHomeNetwork();
    const scheduleEvaluate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(evaluate, 800);
    };

    evaluate(); // eager startup / workspace-switch evaluation
    const unsubscribe = NetInfo.addEventListener(scheduleEvaluate);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [autoSwitchNetwork, globalHomeNetworks, overrideIds, treatVpnAsHome]);
}

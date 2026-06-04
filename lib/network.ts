import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import type { HomeNetwork } from "@/store/config-store";

/**
 * Home-network detection — the single signal behind local/remote URL switching.
 *
 * SSID matching is the only "am I home?" signal we trust, deliberately: the
 * local URL is a private address (192.168.x / 10.x / mDNS name) that is only
 * meaningful and safe on your actual home LAN. We never use it on a network we
 * can't confirm is home, because a stranger's device at the same private address
 * (airport/cafe WiFi) would receive the API key the app sends. So:
 *   - confirmed home network → local URL.
 *   - anything else (away / cellular / other WiFi / VPN that masks the SSID / no
 *     home networks configured) → remote URL only; never the local URL.
 *
 * `evaluateHomeNetwork()` recomputes this on startup, on every (debounced)
 * NetInfo change, and on app resume, writing the ephemeral
 * `networkAwayFromHome` flag the synchronous `getActiveUrl` reads.
 */

/**
 * True only when on a configured home network: the SSID must match, and a pinned
 * BSSID must also match (fails closed if the OS hides the BSSID — guards against
 * a rogue AP cloning the SSID). Under a VPN the SSID is masked (not "wifi" / no
 * details) → false → treated as away → remote, which is the safe default.
 */
export function isHomeNetwork(
  state: NetInfoState,
  homeNetworks: HomeNetwork[],
): boolean {
  if (state.type !== "wifi" || !state.details) return false;
  const ssid = state.details.ssid ?? "";
  const bssid =
    typeof state.details.bssid === "string"
      ? state.details.bssid.toLowerCase()
      : "";
  return homeNetworks.some((n) => {
    if (n.ssid !== ssid) return false;
    if (!n.bssid) return true;
    if (!bssid) return false;
    return n.bssid === bssid;
  });
}

// Shared in-flight gate so startup / NetInfo-change / resume callers don't race.
let evalInFlight = false;

/**
 * Recompute whether we're on a home network and store the away flag. Safe to
 * call unconditionally — early-returns when auto-switch is off, in demo mode, or
 * no home networks are configured (in which case the flag stays at its default
 * `true`, i.e. away → remote, so we never use the private local URL off-home).
 */
export async function evaluateHomeNetwork(): Promise<void> {
  if (evalInFlight) return;
  evalInFlight = true;
  try {
    const store = useConfigStore.getState();
    if (
      store.demoMode ||
      !store.autoSwitchNetwork ||
      store.homeNetworks.length === 0
    ) {
      return;
    }
    const state = await NetInfo.fetch();
    store.setNetworkAwayFromHome(!isHomeNetwork(state, store.homeNetworks));
  } finally {
    evalInFlight = false;
  }
}

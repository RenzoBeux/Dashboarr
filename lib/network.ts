import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import type { Dashboard, HomeNetwork } from "@/store/config-store";
import { detectWifi } from "@/lib/wifi";
import { detectVpnActive } from "@/lib/vpn";

/**
 * Home-network detection — the single signal behind local/remote URL switching.
 *
 * SSID matching is the primary "am I home?" signal we trust, deliberately: the
 * local URL is a private address (192.168.x / 10.x / mDNS name) that is only
 * meaningful and safe on your actual home LAN. We never use it on a network we
 * can't confirm is home, because a stranger's device at the same private address
 * (airport/cafe WiFi) would receive the API key the app sends. So:
 *   - confirmed home network → local URL.
 *   - an active VPN with the opt-in `treatVpnAsHome` setting → counts as home
 *     (the tunnel routes private ranges to the user's own LAN, #185).
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

/**
 * The home-WiFi networks that actually govern local/remote switching right now:
 * the active dashboard's selection resolved against the global list (#148).
 * `homeNetworkIds === undefined` on a dashboard means "use ALL home networks"
 * (the default); an explicit array selects that subset by id (stale ids that no
 * longer match a live network are ignored), and an empty array means "none →
 * always remote". Falls back to all when the active dashboard can't be resolved,
 * so callers without a dashboard set (and pre-v29 state) keep global behavior.
 *
 * Only the active dashboard is consulted — switching workspaces re-evaluates
 * (the useNetworkAutoSwitch effect re-runs when the selection or list changes).
 */
export function resolveEffectiveHomeNetworks(
  dashboards: Dashboard[],
  activeDashboardId: string,
  globalHomeNetworks: HomeNetwork[],
): HomeNetwork[] {
  const active =
    dashboards.find((d) => d.id === activeDashboardId) ?? dashboards[0];
  const ids = active?.homeNetworkIds;
  if (ids === undefined) return globalHomeNetworks;
  const selected = new Set(ids);
  return globalHomeNetworks.filter((n) => selected.has(n.id));
}

// Shared in-flight gate so startup / NetInfo-change / resume callers don't race.
let evalInFlight = false;

/**
 * Recompute whether we're on a home network and store the away flag. Safe to
 * call unconditionally — early-returns when auto-switch is off, in demo mode, or
 * no home networks are configured (in which case the flag stays at its default
 * `true`, i.e. away → remote, so we never use the private local URL off-home).
 *
 * Always refreshes the ephemeral `isVpnActive` flag first, even when the
 * away-flag evaluation early-returns: the off-WiFi LAN guard reads it
 * regardless of auto-switch, and this runs on app resume — the one moment a
 * VPN toggled while the JS runtime was suspended (no NetInfo event) gets
 * noticed (#185).
 */
export async function evaluateHomeNetwork(): Promise<void> {
  if (evalInFlight) return;
  evalInFlight = true;
  try {
    const store = useConfigStore.getState();
    const vpnActive = detectVpnActive();
    store.setIsVpnActive(vpnActive);
    if (store.demoMode || !store.autoSwitchNetwork) return;
    // Opt-in "VPN connected counts as home" (#185): the tunnel routes the
    // private ranges to the user's own LAN, so local URLs are safe. Checked
    // before the SSID match — under a VPN the SSID is often masked anyway.
    if (store.treatVpnAsHome && vpnActive) {
      store.setNetworkAwayFromHome(false);
      return;
    }
    const effective = resolveEffectiveHomeNetworks(
      store.dashboards,
      store.activeDashboardId,
      store.homeNetworks,
    );
    if (effective.length === 0) {
      // No SSIDs to match. With treatVpnAsHome on, a VPN drop must actively
      // flip us back to away; otherwise keep the historical no-op (the flag
      // already sits at its safe default and use-network forces it).
      if (store.treatVpnAsHome) store.setNetworkAwayFromHome(true);
      return;
    }
    const state = await NetInfo.fetch();
    store.setNetworkAwayFromHome(!isHomeNetwork(state, effective));
  } finally {
    evalInFlight = false;
  }
}

/**
 * Re-resolve home/away right after a config import (#168). Import resets
 * `networkAwayFromHome` to its safe `true` default, so a freshly set-up device
 * starts "away" → remote-only. The normal startup/NetInfo evaluation can't clear
 * it on its own: reading the SSID/BSSID needs Location permission, which the new
 * device almost certainly hasn't granted yet — so local-only services stay stuck
 * "invalid URL" until the user stumbles onto the permission.
 *
 * This requests the permission (via detectWifi, which also ensures NetInfo is
 * configured to surface the SSID on iOS) *while the user is actively setting the
 * device up*, then evaluates. No-op when auto-switch is off or no home networks
 * are configured — in those cases the SSID is never needed, so we don't prompt.
 */
export async function reevaluateHomeNetworkAfterImport(): Promise<void> {
  const store = useConfigStore.getState();
  if (store.demoMode || !store.autoSwitchNetwork) return;
  const effective = resolveEffectiveHomeNetworks(
    store.dashboards,
    store.activeDashboardId,
    store.homeNetworks,
  );
  if (effective.length === 0) {
    // No SSIDs to match — but an imported treatVpnAsHome can still clear the
    // away flag via the VPN check, which needs no permission prompt.
    if (store.treatVpnAsHome) await evaluateHomeNetwork();
    return;
  }
  // Prompt for Location now; if granted, the subsequent evaluate reads the real
  // SSID and clears the away flag when we're home. If denied, we stay safely
  // "away" (remote-only) — the honest result.
  await detectWifi();
  await evaluateHomeNetwork();
}

import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useConfigStore } from "@/store/config-store";
import type { Dashboard, HomeNetwork } from "@/store/config-store";
import {
  detectWifiWithRefresh,
  getWifiPermissionStatus,
  refreshWifiIdentity,
} from "@/lib/wifi";
import { detectVpnActive } from "@/lib/vpn";
import {
  matchesHomeNetwork,
  type WifiIdentity,
} from "@/lib/home-network-match";

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
 * NetInfo change, and on app resume, writing two ephemeral store fields:
 *   - `networkAwayFromHome`: the verdict for the ACTIVE dashboard's home
 *     networks, read synchronously by `getActiveUrl` for its instances.
 *   - `currentWifi`: the observed SSID/BSSID, so `getActiveUrl` can judge an
 *     instance that belongs to ANOTHER dashboard against that dashboard's own
 *     home networks (#418): with two houses on identical LAN addressing, the
 *     other house's instance must resolve to remote at this house, not to a
 *     local URL that reaches the wrong box.
 */

/** The WiFi identity a NetInfo state carries, or null off WiFi / masked. */
export function wifiIdentityOf(state: NetInfoState): WifiIdentity | null {
  if (state.type !== "wifi" || !state.details) return null;
  return {
    ssid: state.details.ssid ?? "",
    bssid:
      typeof state.details.bssid === "string"
        ? state.details.bssid.toLowerCase()
        : "",
  };
}

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
  return matchesHomeNetwork(wifiIdentityOf(state), homeNetworks);
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
// `evalQueued` makes the gate RE-RUNNABLE: a call that arrives while one is in
// flight isn't dropped — it sets the flag, and the running pass loops once more
// when it finishes. Without this, toggling `treatVpnAsHome` (or a VPN drop)
// while a slow `NetInfo.fetch()` is pending would be silently lost, leaving the
// away flag stale — the flaky "the toggle did nothing" report (#185). The
// re-run re-reads `getState()`, so it always sees the latest settings.
let evalInFlight = false;
let evalQueued = false;

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
  if (evalInFlight) {
    evalQueued = true;
    return;
  }
  evalInFlight = true;
  try {
    do {
      evalQueued = false;
      await evaluateHomeNetworkOnce();
    } while (evalQueued);
  } finally {
    evalInFlight = false;
  }
}

// One evaluation pass. Reads a fresh store snapshot each call so a re-run
// triggered by `evalQueued` picks up settings changed mid-flight.
async function evaluateHomeNetworkOnce(): Promise<void> {
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
  if (store.homeNetworks.length === 0) {
    // No SSIDs to match anywhere. With treatVpnAsHome on, a VPN drop must
    // actively flip us back to away; otherwise keep the historical no-op (the
    // flag already sits at its safe default and use-network forces it).
    if (store.treatVpnAsHome) store.setNetworkAwayFromHome(true);
    return;
  }
  // An empty ACTIVE selection ("always remote") still needs the SSID read:
  // instances attached to another dashboard are judged against that
  // dashboard's networks via `currentWifi` (#418), and the active verdict
  // below resolves to away regardless (nothing matches an empty list).
  let state = await NetInfo.fetch();
  // iOS transient (#234): NetInfo.fetch() can report type "wifi" with a null
  // SSID for a brief window after cold start or app resume, before the OS
  // surfaces it. A bare fetch would conclude "away" here — and because we're
  // already connected to home WiFi, no NetInfo change event follows, so the
  // flag stays stuck at away (remote-only, the orange "away" indicator) until
  // the next resume or a full app restart. That is the "says I'm not on my
  // WiFi when I am / restart fixes it" report. Force a NetInfo.refresh()+retry
  // (the same #168 machinery) to surface the SSID before deciding. This only
  // runs in the failure case (on WiFi but no SSID yet); genuinely-away states
  // (cellular / VPN-masked / non-matching SSID) resolve on the first fetch
  // with no extra work, and once the SSID surfaces subsequent evaluations skip
  // the refresh entirely.
  if (state.type === "wifi" && !state.details?.ssid) {
    try {
      // Only worth retrying if we can actually read the SSID: without Location
      // permission NetInfo returns a null SSID no matter how many times we
      // refresh, so a denied device would spin the retry loop on every
      // evaluation for nothing. Read the status WITHOUT prompting (the steady
      // state never prompts) — denied simply stays "away", the honest result.
      const { granted } = await getWifiPermissionStatus();
      if (granted) {
        // Warms NetInfo's singleton via refresh()+retry, so the re-fetch below
        // reads the now-surfaced SSID.
        await refreshWifiIdentity();
        state = await NetInfo.fetch();
      }
    } catch {
      // A refresh/permission hiccup must never throw out of the evaluator: fall
      // back to the original null-SSID state, which concludes "away" exactly as
      // it did before this retry existed. Worst case = the old behavior, never
      // worse.
    }
  }
  const wifi = wifiIdentityOf(state);
  // One atomic write for both fields. Writing the identity first would
  // trigger a refetch burst while the active verdict was still the previous
  // network's — on a house A → house B walk, the active dashboard's local
  // URL sent on house B's LAN. See setNetworkObservation.
  store.setNetworkObservation(wifi, !matchesHomeNetwork(wifi, effective));
}

/**
 * Re-resolve home/away right after a config import (#168). Import resets
 * `networkAwayFromHome` to its safe `true` default, so a freshly set-up device
 * starts "away" → remote-only. The normal startup/NetInfo evaluation can't clear
 * it on its own: reading the SSID/BSSID needs Location permission, which the new
 * device almost certainly hasn't granted yet — so local-only services stay stuck
 * "invalid URL" until the user stumbles onto the permission.
 *
 * This requests the permission (via detectWifiWithRefresh, which also force-
 * refreshes NetInfo so the just-authorized SSID surfaces on iOS) *while the user
 * is actively setting the device up*, then evaluates. No-op when auto-switch is
 * off or no home networks are configured — in those cases the SSID is never
 * needed, so we don't prompt.
 */
export async function reevaluateHomeNetworkAfterImport(): Promise<void> {
  const store = useConfigStore.getState();
  if (store.demoMode || !store.autoSwitchNetwork) return;
  if (store.homeNetworks.length === 0) {
    // No SSIDs to match on any dashboard — but an imported treatVpnAsHome can
    // still clear the away flag via the VPN check, which needs no permission
    // prompt. (An empty ACTIVE selection alone is not enough to skip: other
    // dashboards' instances still need the SSID, see evaluateHomeNetworkOnce.)
    if (store.treatVpnAsHome) await evaluateHomeNetwork();
    return;
  }
  // Prompt for Location now; refresh+retry so the SSID is readable on a device
  // granting permission for the FIRST time (netinfo iOS null-SSID bug, #168) —
  // this also warms NetInfo's singleton, so the evaluateHomeNetwork() fetch below
  // reads the surfaced SSID and clears the away flag when we're home. If denied,
  // we stay safely "away" (remote-only) — the honest result.
  await detectWifiWithRefresh();
  await evaluateHomeNetwork();
}

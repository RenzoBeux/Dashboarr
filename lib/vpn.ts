import { requireOptionalNativeModule } from "expo";

/**
 * Native VPN detection (modules/vpn-status). NetInfo cannot report this:
 * on iOS its SCNetworkReachability backend has no VPN branch at all, and on
 * Android it checks TRANSPORT_VPN only after the underlying wifi/cellular
 * transport that the OS merges into the VPN network's capabilities — so a
 * VPN over WiFi/cellular reports as plain "wifi"/"cellular" (#185).
 *
 * Optional require: binaries shipped before the module existed (OTA updates
 * land on them) resolve to null and `detectVpnActive` reports false, which is
 * exactly the pre-VPN-awareness behavior.
 */
const VpnStatus = requireOptionalNativeModule<{ isVpnActive(): boolean }>(
  "VpnStatus",
);

export function detectVpnActive(): boolean {
  try {
    return VpnStatus?.isVpnActive() === true;
  } catch {
    return false;
  }
}

/**
 * Whether the native VpnStatus module is present in the running binary. False
 * when the JS bundle was hot-reloaded onto an app built before the module
 * existed (an OTA update, or `expo start` on a stale dev client) — in that case
 * `detectVpnActive` can only ever return false, so "Treat VPN as home" silently
 * does nothing until a fresh native build. Used by the Home Networks diagnostics.
 */
export function isVpnModuleAvailable(): boolean {
  return VpnStatus != null;
}

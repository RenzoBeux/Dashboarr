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
const VpnStatus = requireOptionalNativeModule<{
  isVpnActive(): boolean;
  // iOS-only, and absent from binaries built before it existed — always call
  // through optional chaining.
  activeTunnelInterfaces?(): string[];
  tunnelDiagnostics?(): TunnelDiagnostics;
}>("VpnStatus");

export interface TunnelDiagnostics {
  /** __SCOPED__ proxy keys naming a tunnel (signal 1 of isVpnActive). */
  scopedProxyInterfaces: string[];
  /**
   * Every tunnel interface holding more than link-local IPv6 (signal 2),
   * counted or not. `addressKinds` are labels like "IPv4 CGNAT" or
   * "IPv6 ULA", never the addresses, so screenshots are safe to post.
   */
  interfaces: { name: string; counts: boolean; addressKinds: string[] }[];
}

export function detectVpnActive(): boolean {
  try {
    return VpnStatus?.isVpnActive() === true;
  } catch {
    return false;
  }
}

/**
 * iOS diagnostics: the tunnel interface names (utun4, ...) behind the
 * interface-sweep half of `isVpnActive` (#340). Empty on Android (its
 * TRANSPORT_VPN check needs no interface evidence) and on stale binaries.
 */
export function getActiveTunnelInterfaces(): string[] {
  try {
    return VpnStatus?.activeTunnelInterfaces?.() ?? [];
  } catch {
    return [];
  }
}

/**
 * iOS diagnostics: both detection signals in full, including tunnels that
 * were ignored and why (#489). Null on Android and on binaries built before
 * it existed.
 */
export function getTunnelDiagnostics(): TunnelDiagnostics | null {
  try {
    return VpnStatus?.tunnelDiagnostics?.() ?? null;
  } catch {
    return null;
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

import ExpoModulesCore

public class VpnStatusModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VpnStatus")

    // iOS has no public "is a VPN up" API; the de facto check is whether the
    // system's scoped proxy settings list a tunnel interface. Detects
    // NEPacketTunnelProvider-based VPNs (WireGuard, Tailscale, OpenVPN
    // Connect, IKEv2 profiles). Reads __SCOPED__ rather than getifaddrs —
    // iOS always has idle system utun interfaces, but only interfaces with
    // active scoped routes appear here.
    Function("isVpnActive") { () -> Bool in
      guard
        let proxySettings = CFNetworkCopySystemProxySettings()?.takeRetainedValue() as? [String: Any],
        let scoped = proxySettings["__SCOPED__"] as? [String: Any]
      else {
        return false
      }
      let tunnelPrefixes = ["utun", "tun", "tap", "ppp", "ipsec"]
      return scoped.keys.contains { key in
        tunnelPrefixes.contains { key.hasPrefix($0) }
      }
    }
  }
}

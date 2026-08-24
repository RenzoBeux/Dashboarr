import Darwin
import ExpoModulesCore

public class VpnStatusModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VpnStatus")

    // iOS has no public "is a VPN up" API, and no single heuristic covers every
    // client, so this ORs two signals:
    //
    // 1. Scoped proxy settings (__SCOPED__) listing a tunnel interface — the
    //    de facto check for VPNs that register per-interface settings (IKEv2
    //    profiles, most commercial clients). Not sufficient alone: Apple DTS
    //    confirms not all VPNs set that property, and WireGuard/Tailscale
    //    tunnels are the reported false negatives (#340).
    // 2. A live tunnel interface (utun/tun/tap/ppp) carrying a routable
    //    address via getifaddrs. Catches every NEPacketTunnelProvider VPN —
    //    including split tunnels whose routes never touch the default path,
    //    the "WireGuard to my homelab LAN only" setup from #340.
    Function("isVpnActive") { () -> Bool in
      Self.scopedProxyTunnelPresent() || !Self.routableTunnelInterfaces().isEmpty
    }

    // The interface names behind signal 2, for the Home Networks diagnostics.
    Function("activeTunnelInterfaces") { () -> [String] in
      Self.routableTunnelInterfaces()
    }
  }

  private static func scopedProxyTunnelPresent() -> Bool {
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

  // Tunnel-named interfaces that are up and hold a routable address.
  //
  // The address filter is what makes interface enumeration safe: iOS always
  // has idle system utun interfaces, but they only carry link-local (fe80::)
  // IPv6, while a real VPN assigns an IPv4 or global/ULA IPv6 address. ULA
  // (fd..) must count — Tailscale's IPv6 range is fd7a:115c:a1e0::/48 and
  // hand-rolled WireGuard configs commonly use fd:: space.
  //
  // "ipsec" is deliberately NOT in this list (unlike the __SCOPED__ check):
  // carrier Wi-Fi calling keeps addressed ipsec interfaces up with no VPN, so
  // sweeping them would false-positive on many phones. IKEv2 VPN profiles set
  // scoped proxies, so signal 1 still covers them.
  private static func routableTunnelInterfaces() -> [String] {
    let tunnelPrefixes = ["utun", "tun", "tap", "ppp"]
    var found = Set<String>()
    var addrs: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&addrs) == 0, let first = addrs else { return [] }
    defer { freeifaddrs(first) }
    var cursor: UnsafeMutablePointer<ifaddrs>? = first
    while let ifa = cursor {
      cursor = ifa.pointee.ifa_next
      guard
        ifa.pointee.ifa_flags & UInt32(IFF_UP) != 0,
        let sa = ifa.pointee.ifa_addr
      else { continue }
      let name = String(cString: ifa.pointee.ifa_name)
      guard tunnelPrefixes.contains(where: { name.hasPrefix($0) }) else { continue }
      switch Int32(sa.pointee.sa_family) {
      case AF_INET:
        found.insert(name)
      case AF_INET6:
        let sin6 = UnsafeRawPointer(sa).assumingMemoryBound(to: sockaddr_in6.self).pointee
        let b = sin6.sin6_addr.__u6_addr.__u6_addr8
        let isLinkLocal = b.0 == 0xfe && (b.1 & 0xc0) == 0x80
        if !isLinkLocal { found.insert(name) }
      default:
        break
      }
    }
    return found.sorted()
  }
}

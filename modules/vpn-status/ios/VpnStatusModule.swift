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
    // 2. A running tunnel interface (utun/tun/tap/ppp) holding an address a VPN
    //    assigns (see `TunnelInterface.counts`). Catches every
    //    NEPacketTunnelProvider VPN, including split tunnels whose routes never
    //    touch the default path, the "WireGuard to my homelab LAN only" setup
    //    from #340.
    Function("isVpnActive") { () -> Bool in
      !Self.scopedProxyTunnels().isEmpty || Self.tunnelInterfaces().contains { $0.counts }
    }

    // The interface names behind signal 2.
    Function("activeTunnelInterfaces") { () -> [String] in
      Self.tunnelInterfaces().filter { $0.counts }.map { $0.name }
    }

    // Everything behind both signals, for the Home Networks diagnostics: the
    // __SCOPED__ keys that matched, and every tunnel interface holding more
    // than link-local IPv6, with the kinds of address it holds and whether
    // they counted (#489). Kinds, never the addresses themselves, so a
    // screenshot pasted into a public issue leaks nothing.
    Function("tunnelDiagnostics") { () -> [String: Any] in
      [
        "scopedProxyInterfaces": Self.scopedProxyTunnels(),
        "interfaces": Self.tunnelInterfaces().map { tunnel -> [String: Any] in
          [
            "name": tunnel.name,
            "counts": tunnel.counts,
            "addressKinds": tunnel.running ? tunnel.kinds : tunnel.kinds + ["not running"],
          ]
        },
      ]
    }
  }

  private static func scopedProxyTunnels() -> [String] {
    guard
      let proxySettings = CFNetworkCopySystemProxySettings()?.takeRetainedValue() as? [String: Any],
      let scoped = proxySettings["__SCOPED__"] as? [String: Any]
    else {
      return []
    }
    let tunnelPrefixes = ["utun", "tun", "tap", "ppp", "ipsec"]
    return scoped.keys.filter { key in
      tunnelPrefixes.contains { key.hasPrefix($0) }
    }.sorted()
  }

  // One address's kind (see TunnelAddressRules.swift), nil when not worth
  // listing.
  private static func classify(_ sa: UnsafePointer<sockaddr>) -> TunnelAddressKind? {
    switch Int32(sa.pointee.sa_family) {
    case AF_INET:
      let sin = UnsafeRawPointer(sa).assumingMemoryBound(to: sockaddr_in.self).pointee
      return TunnelAddressRules.classifyIPv4(UInt32(bigEndian: sin.sin_addr.s_addr))
    case AF_INET6:
      let sin6 = UnsafeRawPointer(sa).assumingMemoryBound(to: sockaddr_in6.self).pointee
      return TunnelAddressRules.classifyIPv6(withUnsafeBytes(of: sin6.sin6_addr) { Array($0) })
    default:
      return nil
    }
  }

  // Up tunnel-named interfaces holding anything beyond link-local IPv6.
  //
  // "ipsec" is deliberately NOT in this list (unlike the __SCOPED__ check):
  // carrier Wi-Fi calling keeps addressed ipsec interfaces up with no VPN, so
  // sweeping them would false-positive on many phones. IKEv2 VPN profiles set
  // scoped proxies, so signal 1 still covers them.
  private static func tunnelInterfaces() -> [TunnelInterface] {
    let tunnelPrefixes = ["utun", "tun", "tap", "ppp"]
    var found: [String: TunnelInterface] = [:]
    var addrs: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&addrs) == 0, let first = addrs else { return [] }
    defer { freeifaddrs(first) }
    var cursor: UnsafeMutablePointer<ifaddrs>? = first
    while let ifa = cursor {
      cursor = ifa.pointee.ifa_next
      let flags = ifa.pointee.ifa_flags
      guard flags & UInt32(IFF_UP) != 0, let sa = ifa.pointee.ifa_addr else { continue }
      let name = String(cString: ifa.pointee.ifa_name)
      guard tunnelPrefixes.contains(where: { name.hasPrefix($0) }) else { continue }
      guard let kind = classify(UnsafePointer(sa)) else { continue }
      var tunnel = found[name] ?? TunnelInterface(name: name)
      tunnel.running = flags & UInt32(IFF_RUNNING) != 0
      tunnel.add(kind)
      found[name] = tunnel
    }
    return found.values.sorted { $0.name < $1.name }
  }
}

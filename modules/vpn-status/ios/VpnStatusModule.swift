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
    //    assigns (see `classify`). Catches every NEPacketTunnelProvider VPN,
    //    including split tunnels whose routes never touch the default path,
    //    the "WireGuard to my homelab LAN only" setup from #340.
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

  private struct AddressKind {
    let label: String
    let counts: Bool
  }

  private struct TunnelInterface {
    let name: String
    var running = false
    var kinds: [String] = []
    var anyCounts = false
    var counts: Bool { running && anyCounts }
  }

  // Which tunnel addresses mean "a VPN is up". nil = link-local IPv6, which
  // every idle system utun carries, so it is not even worth listing.
  //
  // Counted: IPv4 except link-local, global IPv6, and ULA. ULA must count:
  // Tailscale's IPv6 range is fd7a:115c:a1e0::/48 (labelled separately), and
  // WireGuard supports IPv6-only tunnels in fd00::/8, which "Remote URL needs
  // a VPN" (#394) services can sit behind.
  //
  // #489 had utun0 and utun4 counting on an iPhone with no VPN connected,
  // even after Tailscale was uninstalled. What they hold is not known yet, so
  // rather than guess, the diagnostics list every tunnel's address kinds;
  // narrow this rule from what they show.
  private static func classify(_ sa: UnsafePointer<sockaddr>) -> AddressKind? {
    switch Int32(sa.pointee.sa_family) {
    case AF_INET:
      let sin = UnsafeRawPointer(sa).assumingMemoryBound(to: sockaddr_in.self).pointee
      let addr = UInt32(bigEndian: sin.sin_addr.s_addr)
      let b0 = UInt8(addr >> 24)
      let b1 = UInt8((addr >> 16) & 0xff)
      if b0 == 169 && b1 == 254 { return AddressKind(label: "IPv4 link-local", counts: false) }
      if b0 == 100 && (b1 & 0xc0) == 64 { return AddressKind(label: "IPv4 CGNAT", counts: true) }
      if b0 == 10 || (b0 == 172 && (b1 & 0xf0) == 16) || (b0 == 192 && b1 == 168) {
        return AddressKind(label: "IPv4 private", counts: true)
      }
      return AddressKind(label: "IPv4", counts: true)
    case AF_INET6:
      let sin6 = UnsafeRawPointer(sa).assumingMemoryBound(to: sockaddr_in6.self).pointee
      let b = sin6.sin6_addr.__u6_addr.__u6_addr8
      if b.0 == 0xfe && (b.1 & 0xc0) == 0x80 { return nil }
      if b.0 == 0xfd && b.1 == 0x7a && b.2 == 0x11 && b.3 == 0x5c && b.4 == 0xa1 && b.5 == 0xe0 {
        return AddressKind(label: "IPv6 Tailscale", counts: true)
      }
      if (b.0 & 0xfe) == 0xfc { return AddressKind(label: "IPv6 ULA", counts: true) }
      if (b.0 & 0xe0) == 0x20 { return AddressKind(label: "IPv6 global", counts: true) }
      return AddressKind(label: "IPv6 other", counts: false)
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
      if !tunnel.kinds.contains(kind.label) { tunnel.kinds.append(kind.label) }
      tunnel.anyCounts = tunnel.anyCounts || kind.counts
      found[name] = tunnel
    }
    return found.values.sorted { $0.name < $1.name }
  }
}

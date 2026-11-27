// The decision behind VpnStatusModule's tunnel signal, in plain Swift with no
// Darwin or ExpoModulesCore import, so modules/vpn-status/tests can compile
// and run it with swiftc. VpnStatusModule reads the addresses (getifaddrs) and
// feeds them in here.

// What one tunnel address says about a VPN being up (see `TunnelInterface`).
enum TunnelAddressRole {
  // Counts on its own.
  case vpn
  // IPv6 ULA: counts unless the tunnel also holds an `otherIPv4`.
  case ula
  // IPv4 outside the private, CGNAT and link-local ranges: counts unless the
  // tunnel also holds a ULA.
  case otherIPv4
  // Listed in the diagnostics, ignored by the decision.
  case ignored
}

struct TunnelAddressKind {
  let label: String
  let role: TunnelAddressRole
}

enum TunnelAddressRules {
  // Labels name a range, never the address, so a diagnostics screenshot in a
  // public issue leaks nothing. `addr` is in host byte order.
  static func classifyIPv4(_ addr: UInt32) -> TunnelAddressKind {
    let b0 = UInt8(addr >> 24)
    let b1 = UInt8((addr >> 16) & 0xff)
    let b2 = UInt8((addr >> 8) & 0xff)
    if b0 == 169 && b1 == 254 { return TunnelAddressKind(label: "IPv4 link-local", role: .ignored) }
    if b0 == 100 && (b1 & 0xc0) == 64 { return TunnelAddressKind(label: "IPv4 CGNAT", role: .vpn) }
    if b0 == 10 || (b0 == 172 && (b1 & 0xf0) == 16) || (b0 == 192 && b1 == 168) {
      return TunnelAddressKind(label: "IPv4 private", role: .vpn)
    }
    if b0 == 192 && b1 == 0 && b2 == 0 { return TunnelAddressKind(label: "IPv4 192.0.0/24", role: .otherIPv4) }
    if b0 == 198 && (b1 & 0xfe) == 18 { return TunnelAddressKind(label: "IPv4 198.18/15", role: .otherIPv4) }
    if b0 == 127 { return TunnelAddressKind(label: "IPv4 loopback", role: .otherIPv4) }
    if b0 == 0 || b0 >= 224 { return TunnelAddressKind(label: "IPv4 reserved", role: .otherIPv4) }
    // "other", not "public": this also holds special-use ranges not split out
    // above, such as the documentation range 192.0.2.0/24.
    return TunnelAddressKind(label: "IPv4 other", role: .otherIPv4)
  }

  // `bytes` is the 16-byte address. nil = link-local IPv6, which every idle
  // system utun carries, so it is not even worth listing.
  static func classifyIPv6(_ bytes: [UInt8]) -> TunnelAddressKind? {
    guard bytes.count == 16 else { return nil }
    if bytes[0] == 0xfe && (bytes[1] & 0xc0) == 0x80 { return nil }
    if bytes[0..<6].elementsEqual([0xfd, 0x7a, 0x11, 0x5c, 0xa1, 0xe0]) {
      return TunnelAddressKind(label: "IPv6 Tailscale", role: .vpn)
    }
    if (bytes[0] & 0xfe) == 0xfc { return TunnelAddressKind(label: "IPv6 ULA", role: .ula) }
    if (bytes[0] & 0xe0) == 0x20 { return TunnelAddressKind(label: "IPv6 global", role: .vpn) }
    return TunnelAddressKind(label: "IPv6 other", role: .ignored)
  }
}

struct TunnelInterface {
  let name: String
  var running = false
  private(set) var kinds: [String] = []
  private var anyVpn = false
  private var anyULA = false
  private var anyOtherIPv4 = false

  init(name: String) {
    self.name = name
  }

  mutating func add(_ kind: TunnelAddressKind) {
    if !kinds.contains(kind.label) { kinds.append(kind.label) }
    switch kind.role {
    case .vpn: anyVpn = true
    case .ula: anyULA = true
    case .otherIPv4: anyOtherIPv4 = true
    case .ignored: break
    }
  }

  // Whether this tunnel means "a VPN is up".
  //
  // Any address a VPN can hand out counts: private and CGNAT IPv4 (WireGuard
  // 10.x, Tailscale/Headscale 100.64/10), Tailscale's IPv6 range
  // fd7a:115c:a1e0::/48, global IPv6, and ULA, since WireGuard supports
  // IPv6-only tunnels in fd00::/8 that "Remote URL needs a VPN" (#394)
  // services can sit behind. Any other IPv4 counts too: some WireGuard
  // services assign a public address (44Net Connect).
  //
  // Except one shape. #489: an iPhone with no VPN connected, and with
  // Tailscale uninstalled, kept two tunnels up across reboots (renumbered,
  // utun0/utun4 then utun1/utun4/utun5), each holding a ULA plus an IPv4
  // outside the private, CGNAT and link-local ranges. Counting them made a
  // permanent VPN, so with "Treat VPN as home" on the app picked local URLs on
  // every network. A tunnel whose only counting addresses are that pair is
  // ignored; one that also holds a private, CGNAT, Tailscale or global address
  // still counts. The exclusion is a judgment from that one device's data, not
  // documented iOS behavior, so it is kept to exactly that shape.
  var counts: Bool {
    guard running else { return false }
    if anyVpn { return true }
    if anyULA && anyOtherIPv4 { return false }
    return anyULA || anyOtherIPv4
  }
}

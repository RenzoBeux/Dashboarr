// Regression cases for ../ios/TunnelAddressRules.swift (#489, #394). Built
// with plain swiftc and run by tunnel-address-rules.test.ts.

#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

private func kind(_ address: String) -> TunnelAddressKind? {
  var v4 = in_addr()
  if inet_pton(AF_INET, address, &v4) == 1 {
    return TunnelAddressRules.classifyIPv4(UInt32(bigEndian: v4.s_addr))
  }
  var v6 = in6_addr()
  guard inet_pton(AF_INET6, address, &v6) == 1 else { fatalError("bad address \(address)") }
  return TunnelAddressRules.classifyIPv6(withUnsafeBytes(of: v6) { Array($0) })
}

private func counts(_ addresses: [String], running: Bool = true) -> Bool {
  var tunnel = TunnelInterface(name: "utun9")
  tunnel.running = running
  for address in addresses {
    if let k = kind(address) { tunnel.add(k) }
  }
  return tunnel.counts
}

@main
enum TunnelAddressRulesTests {
  static func main() {
    var failures = 0
    func check<T: Equatable>(_ name: String, _ actual: T, _ expected: T) {
      if actual == expected {
        print("ok   \(name)")
      } else {
        failures += 1
        print("FAIL \(name): got \(actual), want \(expected)")
      }
    }

    let ula = "fd12:3456:789a::1"
    let tailscale6 = "fd7a:115c:a1e0::1234"
    let public4 = "44.27.1.2"
    let global6 = "2a01:4f8:c0c:1::2"

    // Real VPNs: must count.
    check("Tailscale: CGNAT + Tailscale IPv6", counts(["100.101.102.103", tailscale6]), true)
    check("WireGuard 10/8", counts(["10.8.0.2"]), true)
    check("WireGuard 172.16/12", counts(["172.20.0.2"]), true)
    check("WireGuard 192.168/16", counts(["192.168.50.2"]), true)
    check("WireGuard private IPv4 + ULA", counts(["10.8.0.2", "fd00:8::2"]), true)
    check("WireGuard IPv6-only ULA (#394)", counts(["fd00:8::2"]), true)
    check("WireGuard IPv6-only global", counts([global6]), true)
    check("WireGuard public IPv4 only", counts([public4]), true)
    check("WireGuard public IPv4 + global IPv6", counts([public4, global6]), true)
    check("WARP-style private IPv4 + global IPv6", counts(["172.16.0.2", "2606:4700:110:8a36::2"]), true)
    check("#489 pair plus a private IPv4", counts([ula, "192.0.0.2", "10.0.0.2"]), true)
    check("#489 pair plus a global IPv6", counts([ula, public4, global6]), true)

    // #489 phantom tunnels and idle utuns: must not count.
    check("#489: ULA + 192.0.0/24", counts([ula, "192.0.0.2"]), false)
    check("#489: ULA + 198.18/15", counts([ula, "198.18.0.1"]), false)
    check("#489: ULA + other IPv4", counts([ula, public4]), false)
    check("link-local only", counts(["fe80::1", "169.254.10.1"]), false)
    check("not running", counts(["10.8.0.2"], running: false), false)
    check("no addresses", counts([]), false)

    // Diagnostics labels: ranges only, never addresses.
    let labels: [(String, String?)] = [
      ("10.0.0.1", "IPv4 private"),
      ("172.31.255.255", "IPv4 private"),
      ("172.32.0.1", "IPv4 other"),
      ("192.168.0.1", "IPv4 private"),
      ("100.64.0.1", "IPv4 CGNAT"),
      ("100.127.255.255", "IPv4 CGNAT"),
      ("100.128.0.1", "IPv4 other"),
      ("169.254.0.1", "IPv4 link-local"),
      ("192.0.0.2", "IPv4 192.0.0/24"),
      ("192.0.2.1", "IPv4 other"),
      ("198.19.255.1", "IPv4 198.18/15"),
      ("198.20.0.1", "IPv4 other"),
      ("127.0.0.1", "IPv4 loopback"),
      ("0.0.0.1", "IPv4 reserved"),
      ("224.0.0.1", "IPv4 reserved"),
      ("8.8.8.8", "IPv4 other"),
      ("fe80::1", nil),
      ("fd7a:115c:a1e0::1", "IPv6 Tailscale"),
      ("fd7a:115c:a1e1::1", "IPv6 ULA"),
      ("fc00::1", "IPv6 ULA"),
      ("2001:db8::1", "IPv6 global"),
      ("3fff::1", "IPv6 global"),
      ("::1", "IPv6 other"),
      ("ff02::1", "IPv6 other"),
    ]
    for (address, label) in labels {
      check("label \(address)", kind(address)?.label, label)
    }

    print(failures == 0 ? "all passed" : "\(failures) failed")
    exit(failures == 0 ? 0 : 1)
  }
}

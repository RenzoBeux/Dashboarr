// Mock native storage before importing — glances-api pulls in http-client →
// config-store → AsyncStorage/SecureStore at module load. The functions under
// test are pure. Same shims as the other unit tests.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import {
  isVirtualInterface,
  rankedInterfaces,
  selectInterfaces,
  NETWORK_INTERFACES_ALL,
} from "@/services/glances-api";
import type { GlancesNetItem } from "@/lib/types";

function iface(
  interface_name: string,
  rx: number,
  tx: number,
  is_up = true,
): GlancesNetItem {
  return {
    interface_name,
    is_up,
    bytes_recv: rx,
    bytes_sent: tx,
    bytes_recv_rate_per_sec: rx,
    bytes_sent_rate_per_sec: tx,
    time_since_update: 1,
  };
}

describe("isVirtualInterface", () => {
  it.each([
    "docker0",
    "docker_gwbridge",
    "br-1a2b3c4d5e6f",
    "veth9a1b2c",
    "virbr0",
    "vnet0",
    "vmnet1",
    "cni0",
    "flannel.1",
    "cali1234567",
    "cilium_host",
    "weave",
    "kube-bridge",
    "nerdctl0",
  ])("treats %s as virtual", (name) => {
    expect(isVirtualInterface(name)).toBe(true);
  });

  it.each([
    "eth0",
    "eno1",
    "enp3s0",
    "ens18",
    "wlan0",
    "wlp2s0",
    "wg0", // WireGuard VPN — a real connection, not virtual
    "tailscale0",
    "tun0",
    "ppp0",
    "br0", // a plain bridge (no Docker hash) is a real interface
    "bond0",
    "team0",
  ])("treats %s as real", (name) => {
    expect(isVirtualInterface(name)).toBe(false);
  });
});

describe("rankedInterfaces", () => {
  it("excludes loopback, puts physical before virtual, sorts by throughput within group", () => {
    const ranked = rankedInterfaces([
      iface("lo", 9_000_000, 9_000_000),
      iface("docker0", 500_000, 500_000),
      iface("veth9a1b", 10, 10),
      iface("eth0", 1_000_000, 100_000),
      iface("wg0", 2_000_000, 2_000_000),
    ]);
    expect(ranked.map((i) => i.interface_name)).toEqual([
      "wg0", // physical, busiest
      "eth0", // physical
      "docker0", // virtual, busiest
      "veth9a1b", // virtual
    ]);
  });

  it("drops interfaces that are explicitly down", () => {
    const ranked = rankedInterfaces([
      iface("eth0", 100, 100, false),
      iface("eth1", 100, 100, true),
    ]);
    expect(ranked.map((i) => i.interface_name)).toEqual(["eth1"]);
  });

  it("computes rx/tx, preferring the server-supplied rate", () => {
    const [eth0] = rankedInterfaces([iface("eth0", 4096, 2048)]);
    expect(eth0.rx).toBe(4096);
    expect(eth0.tx).toBe(2048);
  });

  it("falls back to delta / time_since_update when no rate field is present", () => {
    const [eth0] = rankedInterfaces([
      {
        interface_name: "eth0",
        is_up: true,
        bytes_recv: 8000,
        bytes_sent: 4000,
        time_since_update: 2,
      },
    ]);
    expect(eth0.rx).toBe(4000);
    expect(eth0.tx).toBe(2000);
  });
});

describe("selectInterfaces", () => {
  const net = [
    iface("eth0", 1_000_000, 100_000),
    iface("wg0", 0, 0), // idle physical
    iface("docker0", 500_000, 500_000),
    iface("lo", 9_000_000, 9_000_000),
  ];

  it("returns [] for missing data", () => {
    expect(selectInterfaces(undefined, NETWORK_INTERFACES_ALL)).toEqual([]);
  });

  it("'all' excludes virtual and loopback", () => {
    const names = selectInterfaces(net, NETWORK_INTERFACES_ALL).map(
      (i) => i.interface_name,
    );
    expect(names).toEqual(["eth0", "wg0"]);
    expect(names).not.toContain("docker0");
    expect(names).not.toContain("lo");
  });

  it("'all' with activeOnly also drops idle interfaces", () => {
    const names = selectInterfaces(net, NETWORK_INTERFACES_ALL, {
      activeOnly: true,
    }).map((i) => i.interface_name);
    expect(names).toEqual(["eth0"]); // wg0 is idle
  });

  it("an explicit list returns exactly those, including virtual ones", () => {
    const names = selectInterfaces(net, ["docker0", "eth0"]).map(
      (i) => i.interface_name,
    );
    expect(names.sort()).toEqual(["docker0", "eth0"]);
  });

  it("an explicit list never matches loopback even if named", () => {
    // rankedInterfaces already strips loopback, so it can't be selected.
    expect(selectInterfaces(net, ["lo"])).toEqual([]);
  });
});

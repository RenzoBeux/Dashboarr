import {
  classifyClientId,
  clientRowMatches,
  countBySource,
  formatLeaseExpiry,
  mergeClientRows,
} from "@/lib/adguard-clients";
import type { AdguardTopArrayEntry } from "@/lib/types";

describe("classifyClientId", () => {
  it("tells AGH's four id shapes apart", () => {
    expect(classifyClientId("192.168.1.42")).toBe("ip");
    expect(classifyClientId("fe80::1%eth0")).toBe("ip");
    expect(classifyClientId("AA:BB:CC:DD:EE:FF")).toBe("mac");
    expect(classifyClientId("aa-bb-cc-dd-ee-ff")).toBe("mac");
    expect(classifyClientId("10.0.0.0/24")).toBe("cidr");
    expect(classifyClientId("kids-tablet")).toBe("clientid");
  });
});

describe("formatLeaseExpiry", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("formats remaining time in the nearest useful unit", () => {
    expect(formatLeaseExpiry("2026-10-02T12:30:00Z", now)).toBe("expires in 30m");
    expect(formatLeaseExpiry("2026-10-02T15:12:00Z", now)).toBe("expires in 3h 12m");
    expect(formatLeaseExpiry("2026-10-02T15:00:00Z", now)).toBe("expires in 3h");
    expect(formatLeaseExpiry("2026-10-05T12:00:00Z", now)).toBe("expires in 3d");
    expect(formatLeaseExpiry("2026-10-02T11:00:00Z", now)).toBe("expired");
  });
  it("is null for static leases and garbage", () => {
    expect(formatLeaseExpiry(undefined, now)).toBeNull();
    expect(formatLeaseExpiry("never", now)).toBeNull();
  });
});

describe("mergeClientRows", () => {
  const clients = {
    clients: [
      { name: "Kids tablet", ids: ["AA:BB:CC:DD:EE:01", "kids-tablet"], use_global_settings: false },
      { name: "Office", ids: ["10.0.0.0/28"] },
    ],
    auto_clients: [
      { ip: "10.0.0.20", name: "printer", source: "rDNS" },
      { ip: "10.0.0.5", name: "kids-tablet.lan", source: "DHCP" },
      { ip: "10.0.0.9", name: "", source: "ARP" },
    ],
  };
  const dhcp = {
    enabled: true,
    interface_name: "eth0",
    leases: [
      { mac: "aa:bb:cc:dd:ee:01", ip: "10.0.0.5", hostname: "kids-tablet", expires: "2026-10-03T00:00:00Z" },
      { mac: "aa:bb:cc:dd:ee:02", ip: "10.0.0.6", hostname: "tv", expires: "2026-10-03T00:00:00Z" },
    ],
    static_leases: [{ mac: "aa:bb:cc:dd:ee:03", ip: "10.0.0.7", hostname: "nas" }],
  };
  const topClients: AdguardTopArrayEntry[] = [
    { "10.0.0.5": 500 },
    { "10.0.0.6": 120 },
    { "10.0.0.99": 7 },
    { "kids-tablet": 44 },
  ];

  const rows = mergeClientRows({ clients, dhcp, topClients });
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

  it("folds a lease and an auto client into the configured client they belong to", () => {
    const kids = byName["Kids tablet"]!;
    expect(kids.source).toBe("configured");
    expect(kids.macs).toEqual(["AA:BB:CC:DD:EE:01"]);
    expect(kids.ips).toEqual(["10.0.0.5"]);
    expect(kids.otherIds).toEqual(["kids-tablet"]);
    expect(kids.lease).toEqual({
      ip: "10.0.0.5",
      mac: "aa:bb:cc:dd:ee:01",
      hostname: "kids-tablet",
      expires: "2026-10-03T00:00:00Z",
      static: false,
    });
    // IP count + ClientID count, not double-counted anywhere else.
    expect(kids.queries).toBe(544);
    expect(rows.filter((r) => r.ips.includes("10.0.0.5"))).toHaveLength(1);
  });

  it("lists unclaimed leases as DHCP rows, static ones without expiry", () => {
    expect(byName.tv).toMatchObject({ source: "dhcp", ips: ["10.0.0.6"], queries: 120 });
    expect(byName.nas).toMatchObject({ source: "dhcp", lease: { static: true, expires: undefined } });
  });

  it("lists unclaimed auto clients and falls back to the IP as the name", () => {
    expect(byName.printer).toMatchObject({ source: "auto", discoveredBy: "rDNS", ips: ["10.0.0.20"] });
    expect(byName["10.0.0.9"]).toMatchObject({ source: "auto", discoveredBy: "ARP" });
  });

  it("adds a row for an IP that only the stats know about", () => {
    expect(byName["10.0.0.99"]).toMatchObject({ source: "auto", ips: ["10.0.0.99"], queries: 7 });
  });

  it("keeps a CIDR-only configured client with no queries attributed", () => {
    expect(byName.Office).toMatchObject({ source: "configured", otherIds: ["10.0.0.0/28"], queries: undefined });
  });

  it("sorts by queries desc then name, unknown counts last", () => {
    expect(rows.map((r) => r.name)).toEqual([
      "Kids tablet",
      "tv",
      "10.0.0.99",
      "10.0.0.9",
      "nas",
      "Office",
      "printer",
    ]);
  });

  it("copes with every input missing", () => {
    expect(mergeClientRows({})).toEqual([]);
    expect(mergeClientRows({ clients: {}, dhcp: undefined, topClients: [] })).toEqual([]);
  });
});

describe("clientRowMatches / countBySource", () => {
  const rows = mergeClientRows({
    clients: { clients: [{ name: "Kids tablet", ids: ["AA:BB:CC:DD:EE:01"] }] },
    dhcp: { enabled: true, interface_name: "eth0", leases: [], static_leases: [{ mac: "aa:bb:cc:dd:ee:03", ip: "10.0.0.7", hostname: "nas" }] },
  });
  it("matches on name, ids and lease hostname, case-insensitively", () => {
    expect(rows.filter((r) => clientRowMatches(r, "KIDS"))).toHaveLength(1);
    expect(rows.filter((r) => clientRowMatches(r, "ee:03"))).toHaveLength(1);
    expect(rows.filter((r) => clientRowMatches(r, "10.0.0.7"))).toHaveLength(1);
    expect(rows.filter((r) => clientRowMatches(r, ""))).toHaveLength(2);
    expect(rows.filter((r) => clientRowMatches(r, "zzz"))).toHaveLength(0);
  });
  it("counts rows per source", () => {
    expect(countBySource(rows)).toEqual({ configured: 1, dhcp: 1, auto: 0 });
  });
});

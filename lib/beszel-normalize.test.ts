import {
  formatBeszelUptime,
  normalizeBeszelInfo,
  normalizeBeszelStatsPoint,
  normalizeBeszelSystem,
} from "@/lib/beszel-normalize";
import type { BeszelSystemRecord, BeszelSystemStatsRecord } from "@/lib/types";

// Fixture is the exact terse-key payload captured from a live v0.19.0 Beszel
// hub — see the "--- Beszel Types ---" section of lib/types.ts. Using the
// real wire shape here (not a hand-guessed one) is the point: this is the
// test that would have caught a wrong key mapping before it shipped.
const LIVE_INFO_FIXTURE = {
  t: 4,
  u: 33256,
  cpu: 37.89,
  mp: 26.73,
  dp: 59.76,
  v: "0.19.0",
  p: false,
  g: 51.21,
  dt: 80,
  os: 0 as const,
  bb: 11629704,
  la: [5.17, 6.29, 4.47] as [number, number, number],
  ct: 1 as const,
  efs: { data: 37.62 },
};

describe("normalizeBeszelInfo", () => {
  it("maps every terse wire key to its descriptive field", () => {
    expect(normalizeBeszelInfo(LIVE_INFO_FIXTURE)).toEqual({
      cpuPct: 37.89,
      memPct: 26.73,
      diskPct: 59.76,
      gpuPct: 51.21,
      uptimeSeconds: 33256,
      loadAvg: [5.17, 6.29, 4.47],
      agentVersion: "0.19.0",
      dashboardTempC: 80,
      hostname: undefined,
    });
  });

  it("defaults missing numeric fields to 0 rather than throwing", () => {
    expect(normalizeBeszelInfo(undefined)).toEqual({
      cpuPct: 0,
      memPct: 0,
      diskPct: 0,
      gpuPct: undefined,
      uptimeSeconds: 0,
      loadAvg: undefined,
      agentVersion: "",
      dashboardTempC: undefined,
      hostname: undefined,
    });
  });

  it("never reads a descriptive key that doesn't exist on the wire", () => {
    // A naive implementation might guess `info.cpuPct` instead of `info.cpu` —
    // confirm the normalizer ignores decoy descriptive-looking keys and only
    // trusts the real terse ones.
    const decoy = { cpuPct: 999, memPct: 999, diskPct: 999, cpu: 12.5, mp: 34.5, dp: 56.5 };
    const result = normalizeBeszelInfo(decoy as never);
    expect(result.cpuPct).toBe(12.5);
    expect(result.memPct).toBe(34.5);
    expect(result.diskPct).toBe(56.5);
  });
});

describe("normalizeBeszelSystem", () => {
  it("combines the record's own fields with its normalized info", () => {
    const record: BeszelSystemRecord = {
      id: "sys1",
      name: "media-server",
      status: "up",
      host: "192.168.1.20",
      port: "45876",
      info: LIVE_INFO_FIXTURE,
      created: "2026-01-04T10:00:00.000Z",
      updated: "2026-09-16T15:05:54.530Z",
    };
    expect(normalizeBeszelSystem(record)).toEqual({
      id: "sys1",
      name: "media-server",
      status: "up",
      host: "192.168.1.20",
      cpuPct: 37.89,
      memPct: 26.73,
      diskPct: 59.76,
      gpuPct: 51.21,
      uptimeSeconds: 33256,
      loadAvg: [5.17, 6.29, 4.47],
      agentVersion: "0.19.0",
      dashboardTempC: 80,
      hostname: undefined,
    });
  });
});

describe("normalizeBeszelStatsPoint", () => {
  it("maps the historical stats terse keys, distinct from the Info shape", () => {
    const record: BeszelSystemStatsRecord = {
      id: "stat1",
      system: "sys1",
      type: "1m",
      created: "2026-09-16T15:06:54.723Z",
      stats: {
        cpu: 73.67,
        m: 15.36,
        mu: 5.16,
        mp: 33.58,
        d: 467.35,
        du: 265.78,
        dp: 59.79,
        la: [11.56, 7.64, 5.03],
      },
    };
    expect(normalizeBeszelStatsPoint(record)).toEqual({
      createdAt: "2026-09-16T15:06:54.723Z",
      cpuPct: 73.67,
      memPct: 33.58,
      diskPct: 59.79,
      loadAvg1: 11.56,
    });
  });

  it("defaults missing metrics to 0", () => {
    const record: BeszelSystemStatsRecord = {
      id: "stat1",
      system: "sys1",
      type: "1m",
      created: "2026-09-16T15:06:54.723Z",
      stats: {} as never,
    };
    expect(normalizeBeszelStatsPoint(record)).toEqual({
      createdAt: "2026-09-16T15:06:54.723Z",
      cpuPct: 0,
      memPct: 0,
      diskPct: 0,
      loadAvg1: undefined,
    });
  });
});

describe("formatBeszelUptime", () => {
  it("formats days and hours for long uptimes", () => {
    expect(formatBeszelUptime(452_113)).toBe("5d 5h");
  });

  it("formats hours and minutes under a day", () => {
    expect(formatBeszelUptime(7_500)).toBe("2h 5m");
  });

  it("formats minutes under an hour", () => {
    expect(formatBeszelUptime(120)).toBe("2m");
  });

  it("formats zero/negative as an em dash", () => {
    expect(formatBeszelUptime(0)).toBe("—");
    expect(formatBeszelUptime(-5)).toBe("—");
  });

  it("drops a zero minutes/hours remainder instead of showing '5d 0h'", () => {
    expect(formatBeszelUptime(5 * 86_400)).toBe("5d");
    expect(formatBeszelUptime(3 * 3600)).toBe("3h");
  });
});

import {
  formatBeszelUptime,
  normalizeBeszelContainerStatsPoint,
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

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

function statsRecord(stats: object): BeszelSystemStatsRecord {
  return {
    id: "stat1",
    system: "sys1",
    type: "1m",
    created: "2026-09-16T15:06:54.723Z",
    stats: stats as BeszelSystemStatsRecord["stats"],
  };
}

describe("normalizeBeszelStatsPoint", () => {
  it("reads the new-agent byte fields", () => {
    const p = normalizeBeszelStatsPoint(
      statsRecord({
        cpu: 10,
        mp: 50,
        dp: 40,
        du: 200,
        d: 400,
        mem: [16e9, 8e9, 1e9, 0],
        dio: [1000, 2000],
        b: [300, 400],
        la: [1, 2, 3],
        t: { cpu: 55 },
        g: { "0": { n: "Arc", u: 12 } },
        swap: [4e9, 1e9],
      }),
    );
    expect(p).toEqual({
      createdAt: "2026-09-16T15:06:54.723Z",
      cpuPct: 10,
      memPct: 50,
      memUsedBytes: 8e9,
      memTotalBytes: 16e9,
      diskPct: 40,
      diskUsedBytes: 200 * GiB,
      diskTotalBytes: 400 * GiB,
      diskReadBps: 1000,
      diskWriteBps: 2000,
      netSentBps: 300,
      netRecvBps: 400,
      load: [1, 2, 3],
      temps: { cpu: 55 },
      gpus: { Arc: 12 },
      swapUsedBytes: 1e9,
    });
  });

  it("falls back to the legacy MB/GB fields from older agents", () => {
    const p = normalizeBeszelStatsPoint(
      statsRecord({ cpu: 1, mp: 2, dp: 3, m: 16, mu: 8, dr: 1.5, dw: 2, ns: 0.5, nr: 1, su: 2 }),
    );
    expect(p.memUsedBytes).toBe(8 * GiB);
    expect(p.memTotalBytes).toBe(16 * GiB);
    expect(p.diskReadBps).toBe(1.5 * MiB);
    expect(p.diskWriteBps).toBe(2 * MiB);
    expect(p.netSentBps).toBe(0.5 * MiB);
    expect(p.netRecvBps).toBe(MiB);
    expect(p.swapUsedBytes).toBe(2 * GiB);
  });

  it("leaves absent metrics undefined instead of 0", () => {
    const p = normalizeBeszelStatsPoint(statsRecord({}));
    expect(p.cpuPct).toBeUndefined();
    expect(p.memPct).toBeUndefined();
    expect(p.netSentBps).toBeUndefined();
    expect(p.diskReadBps).toBeUndefined();
    expect(p.load).toBeUndefined();
    expect(p.temps).toEqual({});
    expect(p.gpus).toEqual({});
  });
});

describe("normalizeBeszelContainerStatsPoint", () => {
  it("maps each container, preferring byte bandwidth and falling back to MB", () => {
    const p = normalizeBeszelContainerStatsPoint({
      id: "cs1",
      system: "sys1",
      type: "1m",
      created: "2026-09-16T15:06:54.723Z",
      stats: [
        { n: "plex", c: 12, m: 512, b: [100, 200] },
        { n: "old", c: 1, m: 10, ns: 1, nr: 1 },
      ],
    });
    expect(p).toEqual({
      createdAt: "2026-09-16T15:06:54.723Z",
      containers: {
        plex: { cpuPct: 12, memBytes: 512 * MiB, netBps: 300 },
        old: { cpuPct: 1, memBytes: 10 * MiB, netBps: 2 * MiB },
      },
    });
  });

  it("tolerates a record with no stats array", () => {
    const p = normalizeBeszelContainerStatsPoint({
      id: "cs1",
      system: "sys1",
      type: "1m",
      created: "x",
      stats: null as never,
    });
    expect(p.containers).toEqual({});
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

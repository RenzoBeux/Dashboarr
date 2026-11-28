import { buildDockerCharts, buildSystemCharts, historyView } from "@/lib/beszel-chart-series";
import type { BeszelContainerStatsPoint, BeszelStatsPoint } from "@/lib/types";

const GiB = 1024 ** 3;

function pt(over: Partial<BeszelStatsPoint> = {}): BeszelStatsPoint {
  return { createdAt: "x", temps: {}, gpus: {}, ...over };
}

describe("buildSystemCharts", () => {
  it("orders charts like the hub and drops ones with no data", () => {
    const charts = buildSystemCharts([pt({ cpuPct: 5, memPct: 10, diskPct: 20, netSentBps: 1, netRecvBps: 2 })]);
    expect(charts.map((c) => c.key)).toEqual(["cpu", "mem", "disk", "net"]);
  });

  it("puts used / total in the memory and disk headers", () => {
    const charts = buildSystemCharts([
      pt({ memPct: 50, memUsedBytes: 8 * GiB, memTotalBytes: 16 * GiB, diskPct: 25, diskUsedBytes: GiB, diskTotalBytes: 4 * GiB }),
    ]);
    expect(charts.find((c) => c.key === "mem")!.subtitle).toBe("8.0 GB / 16.0 GB");
    expect(charts.find((c) => c.key === "disk")!.subtitle).toBe("1.0 GB / 4.0 GB");
  });

  it("splits load into 1/5/15 series and keeps the window's gaps aligned", () => {
    const charts = buildSystemCharts([pt({ load: [1, 2, 3] }), pt()]);
    const load = charts.find((c) => c.key === "load")!;
    expect(load.series.map((s) => s.label)).toEqual(["1m", "5m", "15m"]);
    expect(load.series[0].values).toEqual([1, undefined]);
  });

  it("charts the 5 hottest sensors and counts the rest", () => {
    const temps = { a: 30, b: 31, c: 32, d: 33, e: 34, f: 35, g: 36 };
    const temp = buildSystemCharts([pt({ temps })]).find((c) => c.key === "temp")!;
    expect(temp.series.map((s) => s.label)).toEqual(["g", "f", "e", "d", "c"]);
    expect(temp.hiddenCount).toBe(2);
  });

  it("charts one GPU line per GPU name", () => {
    const gpu = buildSystemCharts([pt({ gpus: { Arc: 12, Nvidia: 40 } })]).find((c) => c.key === "gpu")!;
    expect(gpu.fixedMax).toBe(100);
    expect(gpu.series.map((s) => s.label).sort()).toEqual(["Arc", "Nvidia"]);
  });
});

describe("buildDockerCharts", () => {
  it("returns no charts without any container data", () => {
    expect(buildDockerCharts([])).toEqual([]);
    expect(buildDockerCharts([{ createdAt: "x", containers: {} }])).toEqual([]);
  });

  it("builds CPU, memory and network charts with gaps for absent containers", () => {
    const pts: BeszelContainerStatsPoint[] = [
      { createdAt: "1", containers: { plex: { cpuPct: 10, memBytes: 100, netBps: 5 } } },
      { createdAt: "2", containers: { plex: { cpuPct: 12, memBytes: 110, netBps: 6 }, new: { cpuPct: 1, memBytes: 1 } } },
    ];
    const charts = buildDockerCharts(pts);
    expect(charts.map((c) => c.key)).toEqual(["docker-cpu", "docker-mem", "docker-net"]);
    const cpu = charts[0];
    expect(cpu.series.find((s) => s.label === "new")!.values).toEqual([undefined, 1]);
    const net = charts[2];
    expect(net.series.map((s) => s.label)).toEqual(["plex"]);
  });
});

describe("historyView", () => {
  const charts = buildSystemCharts([pt({ cpuPct: 1 })]);

  it("shows the error when the selected range failed, even with the previous range's data on hand", () => {
    expect(historyView({ error: new Error("x"), isPlaceholderData: true, hasData: true, charts })).toBe("error");
  });

  it("keeps showing charts when a background refetch of the same range fails", () => {
    expect(historyView({ error: new Error("x"), isPlaceholderData: false, hasData: true, charts })).toBe("charts");
  });

  it("is loading with no data, empty with data but no charts", () => {
    expect(historyView({ error: null, isPlaceholderData: false, hasData: false, charts: [] })).toBe("loading");
    expect(historyView({ error: null, isPlaceholderData: false, hasData: true, charts: [] })).toBe("empty");
  });
});

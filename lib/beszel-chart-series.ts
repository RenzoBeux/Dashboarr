import {
  BESZEL_SERIES_COLORS,
  hasAnyValue,
  topKeysByAverage,
  type ChartUnit,
  type ChartValues,
} from "@/lib/beszel-chart-math";
import { formatBytes } from "@/lib/utils";
import type { BeszelContainerStatsPoint, BeszelStatsPoint } from "@/lib/types";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: ChartValues;
}

export interface ChartConfig {
  key: string;
  label: string;
  unit: ChartUnit;
  series: ChartSeries[];
  fixedMax?: number;
  subtitle?: string;
  hiddenCount?: number;
}

const TOP_N = 5;
const color = (i: number) => BESZEL_SERIES_COLORS[i % BESZEL_SERIES_COLORS.length];

function series(key: string, label: string, i: number, values: ChartValues): ChartSeries {
  return { key, label, color: color(i), values };
}

function last<T>(points: T[], pick: (p: T) => number | undefined): number | undefined {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = pick(points[i]);
    if (v !== undefined) return v;
  }
  return undefined;
}

function usedOfTotal(used: number | undefined, total: number | undefined): string | undefined {
  return used !== undefined && total ? `${formatBytes(used)} / ${formatBytes(total)}` : undefined;
}

/** One line per key of a per-point map (sensors, GPUs, containers), top N by average. */
function mapSeries(maps: Record<string, number | undefined>[]): { series: ChartSeries[]; hiddenCount: number } {
  const { names, hiddenCount } = topKeysByAverage(maps, TOP_N);
  return { series: names.map((n, i) => series(n, n, i, maps.map((m) => m[n]))), hiddenCount };
}

function keepNonEmpty(charts: ChartConfig[]): ChartConfig[] {
  return charts.filter((c) => c.series.length > 0 && hasAnyValue(c.series.map((s) => s.values)));
}

/** System-level charts in the hub web UI's order; charts with no data are dropped. */
export function buildSystemCharts(points: BeszelStatsPoint[]): ChartConfig[] {
  const col = (pick: (p: BeszelStatsPoint) => number | undefined) => points.map(pick);
  const temps = mapSeries(points.map((p) => p.temps));
  const gpus = mapSeries(points.map((p) => p.gpus));
  return keepNonEmpty([
    { key: "cpu", label: "CPU", unit: "pct", fixedMax: 100, series: [series("cpu", "CPU", 0, col((p) => p.cpuPct))] },
    {
      key: "mem",
      label: "Memory",
      unit: "pct",
      fixedMax: 100,
      subtitle: usedOfTotal(last(points, (p) => p.memUsedBytes), last(points, (p) => p.memTotalBytes)),
      series: [series("mem", "Memory", 1, col((p) => p.memPct))],
    },
    {
      key: "disk",
      label: "Disk",
      unit: "pct",
      fixedMax: 100,
      subtitle: usedOfTotal(last(points, (p) => p.diskUsedBytes), last(points, (p) => p.diskTotalBytes)),
      series: [series("disk", "Disk", 2, col((p) => p.diskPct))],
    },
    {
      key: "dio",
      label: "Disk I/O",
      unit: "bytesPs",
      series: [series("read", "Read", 0, col((p) => p.diskReadBps)), series("write", "Write", 3, col((p) => p.diskWriteBps))],
    },
    {
      key: "net",
      label: "Network",
      unit: "bytesPs",
      series: [series("sent", "Sent", 2, col((p) => p.netSentBps)), series("recv", "Received", 0, col((p) => p.netRecvBps))],
    },
    {
      key: "load",
      label: "Load average",
      unit: "load",
      series: (["1m", "5m", "15m"] as const).map((l, i) => series(l, l, i, col((p) => p.load?.[i]))),
    },
    { key: "temp", label: "Temperature", unit: "celsius", series: temps.series, hiddenCount: temps.hiddenCount },
    { key: "gpu", label: "GPU", unit: "pct", fixedMax: 100, series: gpus.series, hiddenCount: gpus.hiddenCount },
    { key: "swap", label: "Swap", unit: "bytes", series: [series("swap", "Swap", 4, col((p) => p.swapUsedBytes))] },
  ]);
}

/** Per-container CPU / memory / network, top N containers each. Empty without Docker data. */
export function buildDockerCharts(points: BeszelContainerStatsPoint[]): ChartConfig[] {
  const metric = (pick: (c: BeszelContainerStatsPoint["containers"][string]) => number | undefined) =>
    mapSeries(points.map((p) => Object.fromEntries(Object.entries(p.containers).map(([k, c]) => [k, pick(c)]))));
  const cpu = metric((c) => c.cpuPct);
  const mem = metric((c) => c.memBytes);
  const net = metric((c) => c.netBps);
  return keepNonEmpty([
    { key: "docker-cpu", label: "CPU", unit: "pct", ...cpu },
    { key: "docker-mem", label: "Memory", unit: "bytes", ...mem },
    { key: "docker-net", label: "Network", unit: "bytesPs", ...net },
  ]);
}

export type HistoryView = "error" | "loading" | "empty" | "charts";

/**
 * What the History card shows. With keepPreviousData the last range's points
 * stay on hand after a range switch, so "has data" alone would hide a failed
 * switch under the new chip; an error while showing placeholder data means the
 * selected range never loaded. A failed background refetch of the range on
 * screen keeps its charts.
 */
export function historyView(q: {
  error: unknown;
  isPlaceholderData: boolean;
  hasData: boolean;
  charts: ChartConfig[];
}): HistoryView {
  if (q.error && (!q.hasData || q.isPlaceholderData)) return "error";
  if (!q.hasData) return "loading";
  return q.charts.length === 0 ? "empty" : "charts";
}

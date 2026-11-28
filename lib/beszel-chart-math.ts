import { formatBytes, formatSpeed } from "@/lib/utils";

export type ChartUnit = "pct" | "bytes" | "bytesPs" | "celsius" | "load";
export type ChartValues = (number | undefined)[];

/** Series line colours, 500-shade accents: mid-palette, so they read on both themes. */
export const BESZEL_SERIES_COLORS = [
  "#3b82f6", // blue
  "#a855f7", // purple
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

export function formatChartValue(v: number, unit: ChartUnit): string {
  switch (unit) {
    case "pct":
      return `${v.toFixed(0)}%`;
    case "celsius":
      return `${v.toFixed(0)}°C`;
    case "load":
      return v.toFixed(2);
    case "bytes":
      return formatBytes(v);
    case "bytesPs":
      return formatSpeed(v);
  }
}

export function hasAnyValue(series: ChartValues[]): boolean {
  return series.some((s) => s.some((v) => v !== undefined));
}

/** Top of the Y axis: `fixedMax` for percentages, else the data max plus 10% headroom. */
export function chartYMax(series: ChartValues[], fixedMax?: number): number {
  if (fixedMax !== undefined) return fixedMax;
  let max = 0;
  for (const s of series) for (const v of s) if (v !== undefined && v > max) max = v;
  return max > 0 ? max * 1.1 : 1;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Polyline `points` strings, one per run of consecutive defined values, so a
 * gap (agent offline, container not yet started) breaks the line instead of
 * dropping to 0. X spreads the whole array across `width`; Y maps 0..yMax
 * onto height..topPad. A lone point becomes a short flat segment so it stays
 * visible.
 */
export function buildPath(values: ChartValues, width: number, height: number, topPad: number, yMax: number): string[] {
  const plot = height - topPad;
  const n = values.length;
  const xOf = (i: number) => (n > 1 ? (i / (n - 1)) * width : width / 2);
  const yOf = (v: number) => topPad + plot - (Math.min(Math.max(v, 0), yMax) / yMax) * plot;

  const runs: string[] = [];
  let run: string[] = [];
  let runStart = 0;
  const flush = (end: number) => {
    if (run.length === 1) {
      const seg = Math.min(width, 4);
      const x = Math.min(Math.max(xOf(runStart) - seg / 2, 0), width - seg);
      const y = run[0].split(",")[1];
      run = [`${round(x)},${y}`, `${round(x + seg)},${y}`];
    }
    if (run.length) runs.push(run.join(" "));
    run = [];
    runStart = end + 1;
  };
  values.forEach((v, i) => {
    if (v === undefined) return flush(i);
    run.push(`${round(xOf(i))},${round(yOf(v))}`);
  });
  flush(n);
  return runs;
}

/**
 * The `n` keys with the highest average across `maps` (one map per point).
 * Each key averages only the points it appears in, so a container started (or
 * a sensor appearing) mid-window isn't penalised for the time it didn't exist.
 */
export function topKeysByAverage(
  maps: Record<string, number | undefined>[],
  n = 5,
): { names: string[]; hiddenCount: number } {
  const sums = new Map<string, { total: number; count: number }>();
  for (const m of maps) {
    for (const [name, v] of Object.entries(m)) {
      if (v === undefined) continue;
      const acc = sums.get(name) ?? { total: 0, count: 0 };
      acc.total += v;
      acc.count += 1;
      sums.set(name, acc);
    }
  }
  const ranked = [...sums.entries()]
    .map(([name, { total, count }]) => ({ name, avg: total / count }))
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name));
  return { names: ranked.slice(0, n).map((r) => r.name), hiddenCount: Math.max(0, ranked.length - n) };
}

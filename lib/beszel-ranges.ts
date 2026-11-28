/**
 * The hub web UI's chart time ranges (henrygd/beszel internal/site/src/lib/
 * utils.ts `chartTimeData`, v0.21.2) minus its 1-minute realtime entry, which
 * streams over PocketBase realtime instead of reading stored rollups.
 */
export type BeszelRange = "1h" | "12h" | "24h" | "1w" | "30d";
export type BeszelRollup = "1m" | "10m" | "20m" | "120m" | "480m";

interface BeszelRangeInfo {
  rollup: BeszelRollup;
  /** Window length: the query asks for records created after now - ms. */
  ms: number;
  label: string;
  /** No point re-fetching faster than a new rollup record can land. */
  pollMs: number;
  /** Axis labels show days rather than clock times. */
  longFormat: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function range(rollup: BeszelRollup, ms: number, label: string, longFormat: boolean): BeszelRangeInfo {
  const rollupMs = parseInt(rollup, 10) * MIN;
  return { rollup, ms, label, pollMs: Math.max(MIN, rollupMs), longFormat };
}

export const BESZEL_RANGES: Record<BeszelRange, BeszelRangeInfo> = {
  "1h": range("1m", HOUR, "1h", false),
  "12h": range("10m", 12 * HOUR, "12h", false),
  "24h": range("20m", DAY, "24h", false),
  "1w": range("120m", 7 * DAY, "1w", true),
  "30d": range("480m", 30 * DAY, "30d", true),
};

export const BESZEL_RANGE_ORDER: BeszelRange[] = ["1h", "12h", "24h", "1w", "30d"];

/** PocketBase stores `created` as "YYYY-MM-DD HH:MM:SS.sssZ" (UTC, space separator). */
export function beszelSinceFilter(r: BeszelRange, now: number): string {
  return new Date(now - BESZEL_RANGES[r].ms).toISOString().slice(0, 19).replace("T", " ");
}

import {
  QueriesOverTimeChart as SharedQueriesOverTimeChart,
  type QueryBucket,
} from "@/components/common/queries-over-time-chart";
import { formatClockTime, formatShortDate } from "@/lib/adguard-format";

interface QueriesOverTimeChartProps {
  /** /control/stats's parallel arrays, oldest first — NOT bucket objects. */
  dnsQueries: readonly number[];
  blockedFiltering: readonly number[];
  timeUnits: "hours" | "days";
  /** The instant the stats were fetched (the query's dataUpdatedAt), used to
   * derive each bucket's approximate label — AGH's /control/stats gives no
   * per-bucket timestamp, only time_units + array order. */
  asOfMs: number;
  maxLabels?: number;
}

/**
 * DNS activity over the reporting window. Thin wrapper around
 * components/common/queries-over-time-chart.tsx: this is the only piece that
 * knows AdGuard's shape — parallel `dns_queries`/`blocked_filtering` arrays
 * with no per-bucket timestamp, and (unlike Pi-hole's 144 ten-minute buckets)
 * already small (24 hourly or up to ~90 daily), so no downsampling is needed.
 */
export function QueriesOverTimeChart({
  dnsQueries,
  blockedFiltering,
  timeUnits,
  asOfMs,
  maxLabels,
}: QueriesOverTimeChartProps) {
  const n = dnsQueries.length;
  const unitMs = timeUnits === "days" ? 86_400_000 : 3_600_000;

  const getBuckets = (): QueryBucket[] =>
    dnsQueries.map((total, i) => {
      const bucketMs = asOfMs - (n - 1 - i) * unitMs;
      return {
        key: i,
        total,
        blocked: Math.min(blockedFiltering[i] ?? 0, total),
        label: timeUnits === "days" ? formatShortDate(bucketMs) : formatClockTime(bucketMs),
      };
    });

  return <SharedQueriesOverTimeChart getBuckets={getBuckets} maxLabels={maxLabels} />;
}

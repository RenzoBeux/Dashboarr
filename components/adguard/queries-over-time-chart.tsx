import { useCallback } from "react";
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
   * derive each bucket's label — AGH's /control/stats gives no per-bucket
   * timestamp, only time_units + array order. Floored to the hour boundary
   * below, because that is where AGH's own hourly buckets start. */
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

  // Hourly buckets get floored to the hour BOUNDARY. AGH keys each unit by
  // `time.Now().Unix() / secsInHour` (internal/stats/unit.go), so labelling
  // straight off `asOfMs` prints the fetch minute on every bar ("14:37",
  // "13:37", ...) and implies a precision the data does not have. Zones offset
  // by a half or quarter hour will legitimately read ":30"/":45" — that IS
  // where AGH's hour falls for them.
  //
  // Daily buckets are deliberately NOT floored: AGH's day is 24 of those UTC
  // hours, and flooring to UTC midnight renders as the PREVIOUS local date for
  // any negative-offset zone. Stepping back in 24h hops from the fetch instant
  // keeps the labels on the dates the user actually recognises.
  const anchorMs = timeUnits === "days" ? asOfMs : Math.floor(asOfMs / unitMs) * unitMs;

  const getBuckets = useCallback(
    (): QueryBucket[] =>
      dnsQueries.map((total, i) => {
        const bucketMs = anchorMs - (n - 1 - i) * unitMs;
        return {
          key: i,
          total,
          blocked: Math.min(blockedFiltering[i] ?? 0, total),
          label:
            timeUnits === "days" ? formatShortDate(bucketMs) : formatClockTime(bucketMs),
        };
      }),
    [dnsQueries, blockedFiltering, timeUnits, anchorMs, unitMs, n],
  );

  return <SharedQueriesOverTimeChart getBuckets={getBuckets} maxLabels={maxLabels} />;
}

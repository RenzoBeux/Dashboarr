import {
  QueriesOverTimeChart as SharedQueriesOverTimeChart,
  type QueryBucket,
} from "@/components/common/queries-over-time-chart";
import {
  downsampleHistory,
  formatClockTime,
  historyChunkForWidth,
} from "@/lib/pihole-format";
import type { PiholeHistoryPoint } from "@/lib/pihole-normalize";

interface QueriesOverTimeChartProps {
  history: readonly PiholeHistoryPoint[];
  maxLabels?: number;
}

/**
 * 24 hours of DNS activity. Thin wrapper around
 * components/common/queries-over-time-chart.tsx: this is the only piece that
 * knows Pi-hole's shape — 144 ten-minute points that need downsampling to fit
 * the measured width (a wider card, e.g. tablet or landscape, automatically
 * shows finer resolution). `history.total` is already the sum of
 * cached + blocked + forwarded, so the shared chart's two-segment stack
 * (blocked vs everything else) doesn't double-count.
 */
export function QueriesOverTimeChart({ history, maxLabels }: QueriesOverTimeChartProps) {
  const getBuckets = (width: number): QueryBucket[] =>
    downsampleHistory(history, historyChunkForWidth(history.length, width)).map((b) => ({
      key: b.timestampMs,
      total: b.total,
      blocked: b.blocked,
      label: formatClockTime(b.timestampMs),
    }));

  return <SharedQueriesOverTimeChart getBuckets={getBuckets} maxLabels={maxLabels} />;
}

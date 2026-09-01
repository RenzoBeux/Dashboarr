import { Fragment, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";
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

const BLOCKED_COLOR = "#ef4444";
const ALLOWED_COLOR = "#3b82f6";

/**
 * 24 hours of DNS activity, blocked stacked against everything else.
 *
 * Hand-rolled react-native-svg in the components/tautulli/plays-bar-chart.tsx
 * style — there is no chart library in this app and none should be added.
 *
 * Two decisions worth keeping:
 *
 *   - TWO segments, not four. `history.total` is already the sum of
 *     cached + blocked + forwarded, so stacking all of them double-counts every
 *     bucket. Blocked sits at the BOTTOM so the red band forms a continuous
 *     baseline that stays scannable at a few dp wide; allowed (total - blocked)
 *     goes above. Pi-hole's own three-way split is available in the data but
 *     three colours in a 5dp column is noise on a phone.
 *   - The bucket count follows the MEASURED width. 144 ten-minute points across
 *     a phone card is ~2dp per bar, which aliases into mush, so consecutive
 *     points are summed to fit. A wider card (tablet, landscape) automatically
 *     shows finer resolution.
 */
export function QueriesOverTimeChart({
  history,
  maxLabels = 6,
}: QueriesOverTimeChartProps) {
  const uiScale = useUiScale();
  const [width, setWidth] = useState(0);

  const chartHeight = 150 * uiScale;
  const labelBand = 18 * uiScale;
  const topPad = 6 * uiScale;
  const fontSize = 10 * uiScale;
  const plotHeight = chartHeight - labelBand - topPad;

  // The chunk is NOT scaled by uiScale: bars are graphics, not type, and
  // growing them at a higher scale would only show the user less of their data.
  const buckets = useMemo(
    () => downsampleHistory(history, historyChunkForWidth(history.length, width)),
    [history, width],
  );

  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const empty = n === 0 || buckets.every((b) => b.total === 0);

  // total = n*bar + (n-1)*gap, with gap = 0.25*bar — same ratio as PlaysBarChart.
  const barWidth = n > 0 ? width / (n + 0.25 * Math.max(0, n - 1)) : 0;
  const gap = barWidth * 0.25;
  const step = Math.max(1, Math.ceil(n / maxLabels));

  return (
    <View>
      <View className="flex-row items-center gap-4 mb-2">
        <LegendDot className="bg-danger" label="Blocked" />
        <LegendDot className="bg-primary" label="Allowed" />
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width === 0 ? (
          <View style={{ height: chartHeight }} />
        ) : empty ? (
          <View
            style={{ height: chartHeight }}
            className="items-center justify-center"
          >
            <Text className="text-zinc-500 text-sm">No query data in this window</Text>
          </View>
        ) : (
          <Svg width={width} height={chartHeight}>
            {buckets.map((bucket, i) => {
              const x = i * (barWidth + gap);
              const totalH =
                bucket.total > 0
                  ? Math.max((bucket.total / max) * plotHeight, 2)
                  : 0;
              if (totalH === 0) return null;
              const blockedH = (bucket.blocked / bucket.total) * totalH;
              const allowedH = totalH - blockedH;
              const radius = Math.min(barWidth / 2, 3);
              const baseY = topPad + plotHeight;
              return (
                // Fragment, not View: only SVG primitives may nest inside Svg.
                <Fragment key={bucket.timestampMs}>
                  {/* Allowed on top. Rounded only here — rounding the bottom
                      segment too would show a seam between the two. */}
                  {allowedH > 0 && (
                    <Rect
                      x={x}
                      y={baseY - totalH}
                      width={barWidth}
                      height={allowedH}
                      rx={radius}
                      fill={ALLOWED_COLOR}
                      opacity={0.9}
                    />
                  )}
                  {blockedH > 0 && (
                    <Rect
                      x={x}
                      y={baseY - blockedH}
                      width={barWidth}
                      height={blockedH}
                      fill={BLOCKED_COLOR}
                      opacity={0.95}
                    />
                  )}
                </Fragment>
              );
            })}
            {buckets.map((bucket, i) =>
              i % step === 0 ? (
                <SvgText
                  key={`label-${bucket.timestampMs}`}
                  x={i * (barWidth + gap) + barWidth / 2}
                  y={chartHeight - 4 * uiScale}
                  fontSize={fontSize}
                  fill="#71717a"
                  textAnchor="middle"
                >
                  {formatClockTime(bucket.timestampMs)}
                </SvgText>
              ) : null,
            )}
          </Svg>
        )}
      </View>
    </View>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`w-2 h-2 rounded-full ${className}`} />
      <Text className="text-zinc-500 text-xs">{label}</Text>
    </View>
  );
}

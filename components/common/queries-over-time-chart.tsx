import { Fragment, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";

export interface QueryBucket {
  key: string | number;
  total: number;
  blocked: number;
  label: string;
}

interface QueriesOverTimeChartProps {
  /**
   * Given the measured pixel width, return the buckets to draw. Called on
   * every render, so it stays cheap: Pi-hole downsamples its 144 ten-minute
   * points to fit the width, AdGuard's own stats arrays are already small
   * (24 hourly or ~90 daily buckets) and ignore the argument entirely.
   */
  getBuckets: (width: number) => QueryBucket[];
  maxLabels?: number;
}

const BLOCKED_COLOR = "#ef4444";
const ALLOWED_COLOR = "#3b82f6";

/**
 * DNS activity over a reporting window, blocked stacked against everything
 * else. Hand-rolled react-native-svg in the components/tautulli/plays-bar-chart.tsx
 * style — there is no chart library in this app and none should be added.
 *
 * Shared by Pi-hole and AdGuard Home: both draw the same way (two segments,
 * blocked at the BOTTOM so the red band forms a continuous baseline that
 * stays scannable at a few dp wide; allowed on top). They only differ in HOW
 * the buckets are produced from their own data shape — see `getBuckets`.
 */
export function QueriesOverTimeChart({
  getBuckets,
  maxLabels = 6,
}: QueriesOverTimeChartProps) {
  const uiScale = useUiScale();
  const [width, setWidth] = useState(0);

  const chartHeight = 150 * uiScale;
  const labelBand = 18 * uiScale;
  const topPad = 6 * uiScale;
  const fontSize = 10 * uiScale;
  const plotHeight = chartHeight - labelBand - topPad;

  const buckets = width > 0 ? getBuckets(width) : [];
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
                bucket.total > 0 ? Math.max((bucket.total / max) * plotHeight, 2) : 0;
              if (totalH === 0) return null;
              const blockedH =
                bucket.total > 0 ? (bucket.blocked / bucket.total) * totalH : 0;
              const allowedH = totalH - blockedH;
              const radius = Math.min(barWidth / 2, 3);
              const baseY = topPad + plotHeight;
              return (
                // Fragment, not View: only SVG primitives may nest inside Svg.
                <Fragment key={bucket.key}>
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
                  key={`label-${bucket.key}`}
                  x={i * (barWidth + gap) + barWidth / 2}
                  y={chartHeight - 4 * uiScale}
                  fontSize={fontSize}
                  fill="#71717a"
                  textAnchor="middle"
                >
                  {bucket.label}
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

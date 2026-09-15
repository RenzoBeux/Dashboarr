import { Fragment, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";
import { formatClockTime } from "@/lib/adguard-format";

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

const BLOCKED_COLOR = "#ef4444";
const ALLOWED_COLOR = "#3b82f6";

/**
 * DNS activity over the reporting window, blocked stacked against everything
 * else. Hand-rolled react-native-svg, mirroring
 * components/pihole/queries-over-time-chart.tsx — there is no chart library
 * in this app and none should be added.
 *
 * Unlike Pi-hole's 144 ten-minute buckets, AGH's own arrays are already small
 * (24 hourly or up to ~90 daily buckets), so this renders one bar per bucket
 * directly with no downsampling.
 */
export function QueriesOverTimeChart({
  dnsQueries,
  blockedFiltering,
  timeUnits,
  asOfMs,
  maxLabels = 6,
}: QueriesOverTimeChartProps) {
  const uiScale = useUiScale();
  const [width, setWidth] = useState(0);

  const chartHeight = 150 * uiScale;
  const labelBand = 18 * uiScale;
  const topPad = 6 * uiScale;
  const fontSize = 10 * uiScale;
  const plotHeight = chartHeight - labelBand - topPad;

  const n = dnsQueries.length;
  const max = Math.max(1, ...dnsQueries);
  const empty = n === 0 || dnsQueries.every((v) => v === 0);
  const unitMs = timeUnits === "days" ? 86_400_000 : 3_600_000;

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
            {dnsQueries.map((total, i) => {
              const blocked = Math.min(blockedFiltering[i] ?? 0, total);
              const x = i * (barWidth + gap);
              const totalH = total > 0 ? Math.max((total / max) * plotHeight, 2) : 0;
              if (totalH === 0) return null;
              const blockedH = total > 0 ? (blocked / total) * totalH : 0;
              const allowedH = totalH - blockedH;
              const radius = Math.min(barWidth / 2, 3);
              const baseY = topPad + plotHeight;
              return (
                // Fragment, not View: only SVG primitives may nest inside Svg.
                <Fragment key={i}>
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
            {dnsQueries.map((_, i) =>
              i % step === 0 ? (
                <SvgText
                  key={`label-${i}`}
                  x={i * (barWidth + gap) + barWidth / 2}
                  y={chartHeight - 4 * uiScale}
                  fontSize={fontSize}
                  fill="#71717a"
                  textAnchor="middle"
                >
                  {formatClockTime(asOfMs - (n - 1 - i) * unitMs)}
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

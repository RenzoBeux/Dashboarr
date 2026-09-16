import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";
import type { BeszelStatsPoint } from "@/lib/types";

interface HistoryChartProps {
  points: BeszelStatsPoint[];
  metric: "cpuPct" | "memPct" | "diskPct";
  color: string;
  label: string;
}

/**
 * A single-metric percentage line over time. Hand-rolled react-native-svg in
 * the components/common/queries-over-time-chart.tsx style — there is no
 * charting library in this app and none should be added. This is the first
 * LINE chart (that one draws bars); the shape is deliberately minimal so it
 * reads as the pattern to copy for the next one, not a one-off.
 */
export function HistoryChart({ points, metric, color, label }: HistoryChartProps) {
  const uiScale = useUiScale();
  const [width, setWidth] = useState(0);
  const height = 120 * uiScale;
  const topPad = 8 * uiScale;
  const bottomPad = 8 * uiScale;
  const plotHeight = height - topPad - bottomPad;

  const values = points.map((p) => p[metric]);
  const latest = values[values.length - 1];

  const coords =
    width > 0 && values.length > 0
      ? values
          .map((v, i) => {
            const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2;
            const clamped = Math.min(Math.max(v, 0), 100);
            const y = topPad + plotHeight - (clamped / 100) * plotHeight;
            return `${x},${y}`;
          })
          .join(" ")
      : "";

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-zinc-500 text-xs">{label}</Text>
        {latest !== undefined ? (
          <Text className="text-zinc-300 text-xs font-semibold">{latest.toFixed(0)}%</Text>
        ) : null}
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width === 0 ? (
          <View style={{ height }} />
        ) : values.length === 0 ? (
          <View style={{ height }} className="items-center justify-center">
            <Text className="text-zinc-500 text-sm">No history yet</Text>
          </View>
        ) : (
          <Svg width={width} height={height}>
            <Polyline points={coords} fill="none" stroke={color} strokeWidth={2} />
          </Svg>
        )}
      </View>
    </View>
  );
}

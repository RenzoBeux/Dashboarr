import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useUiScale } from "@/hooks/use-ui-scale";
import {
  buildPath,
  chartYMax,
  formatChartValue,
  hasAnyValue,
  type ChartUnit,
  type ChartValues,
} from "@/lib/beszel-chart-math";

export interface HistorySeries {
  key: string;
  label: string;
  color: string;
  values: ChartValues;
}

interface HistoryChartProps {
  label: string;
  unit: ChartUnit;
  series: HistorySeries[];
  /** createdAt of each point, same length and order as every series' values. */
  timestamps: string[];
  /** Day labels (1w/30d) instead of clock times. */
  longFormat: boolean;
  /** Fixed Y top, e.g. 100 for percentages; otherwise scales to the data. */
  fixedMax?: number;
  /** Replaces the latest-value readout in the header (e.g. "9.8 GB / 16 GB"). */
  subtitle?: string;
  /** Series left out of the chart (Docker top-N); shown as "+N more". */
  hiddenCount?: number;
}

function lastDefined(values: ChartValues): number | undefined {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== undefined) return values[i];
  return undefined;
}

function formatTick(iso: string | undefined, longFormat: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return longFormat
    ? d.toLocaleDateString([], { month: "short", day: "numeric" })
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * A multi-series line chart over time, hand-rolled in react-native-svg (no
 * charting library in this app, and none should be added). Every Beszel graph
 * is a configuration of this one component. Renders nothing when no series
 * has a single value, so absent hardware (no GPU, no sensors) leaves no box.
 */
export function HistoryChart({
  label,
  unit,
  series,
  timestamps,
  longFormat,
  fixedMax,
  subtitle,
  hiddenCount = 0,
}: HistoryChartProps) {
  const uiScale = useUiScale();
  const tc = useThemeColor();
  const [width, setWidth] = useState(0);
  const allValues = series.map((s) => s.values);
  if (!hasAnyValue(allValues)) return null;

  const height = 120 * uiScale;
  const topPad = 6 * uiScale;
  const yMax = chartYMax(allValues, fixedMax);
  const multi = series.length > 1;
  const single = !multi ? lastDefined(series[0].values) : undefined;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1 gap-2">
        <Text className="text-zinc-400 text-xs font-medium">{label}</Text>
        {subtitle ? (
          <Text className="text-zinc-300 text-xs font-semibold" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : single !== undefined ? (
          <Text className="text-zinc-300 text-xs font-semibold">{formatChartValue(single, unit)}</Text>
        ) : null}
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width === 0 ? (
          <View style={{ height }} />
        ) : (
          <View>
            <Svg width={width} height={height}>
              {series.flatMap((s) =>
                buildPath(s.values, width, height, topPad, yMax).map((points, i) => (
                  <Polyline
                    key={`${s.key}-${i}`}
                    points={points}
                    fill="none"
                    stroke={tc(s.color)}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                )),
              )}
            </Svg>
            <Text className="absolute top-0 left-0 text-zinc-600 text-[0.65rem]">
              {formatChartValue(yMax, unit)}
            </Text>
          </View>
        )}
      </View>

      <View className="flex-row justify-between mt-1">
        <Text className="text-zinc-600 text-[0.65rem]">{formatTick(timestamps[0], longFormat)}</Text>
        <Text className="text-zinc-600 text-[0.65rem]">
          {formatTick(timestamps[timestamps.length - 1], longFormat)}
        </Text>
      </View>

      {multi ? (
        <View className="flex-row flex-wrap gap-x-3 gap-y-1 mt-1">
          {series.map((s) => {
            const latest = lastDefined(s.values);
            return (
              <View key={s.key} className="flex-row items-center gap-1">
                <View className="w-2 h-2 rounded-full" style={{ backgroundColor: tc(s.color) }} />
                <Text className="text-zinc-400 text-xs" numberOfLines={1}>
                  {s.label}
                  {latest !== undefined ? ` ${formatChartValue(latest, unit)}` : ""}
                </Text>
              </View>
            );
          })}
          {hiddenCount > 0 ? <Text className="text-zinc-500 text-xs">+{hiddenCount} more</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

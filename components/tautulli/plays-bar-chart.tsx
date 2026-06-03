import { useState } from "react";
import { View, Text } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";

interface PlaysBarChartProps {
  values: number[];
  // Pre-formatted x-axis labels, one per value. Rendered sparsely so they
  // don't collide (every Nth, evenly spaced) — caller keeps them short.
  labels: string[];
  // Roughly how many labels to show across the axis.
  maxLabels?: number;
  color?: string;
}

// Compact bar chart for Tautulli's get_plays_by_* data. Sizes itself to the
// measured container width; heights/fonts scale with the UI-scale setting.
export function PlaysBarChart({
  values,
  labels,
  maxLabels = 7,
  color = "#3b82f6",
}: PlaysBarChartProps) {
  const uiScale = useUiScale();
  const [width, setWidth] = useState(0);

  const chartHeight = 150 * uiScale;
  const labelBand = 18 * uiScale;
  const topPad = 6 * uiScale;
  const fontSize = 10 * uiScale;
  const plotHeight = chartHeight - labelBand - topPad;

  const n = values.length;
  const max = Math.max(1, ...values);
  const empty = values.every((v) => v === 0);

  // total = n*bar + (n-1)*gap, with gap = 0.25*bar.
  const barWidth = n > 0 ? width / (n + 0.25 * Math.max(0, n - 1)) : 0;
  const gap = barWidth * 0.25;
  const step = Math.max(1, Math.ceil(n / maxLabels));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width === 0 ? (
        <View style={{ height: chartHeight }} />
      ) : empty ? (
        <View style={{ height: chartHeight }} className="items-center justify-center">
          <Text className="text-zinc-500 text-sm">No plays in this range</Text>
        </View>
      ) : (
        <Svg width={width} height={chartHeight}>
          {values.map((v, i) => {
            const barH = v > 0 ? Math.max((v / max) * plotHeight, 2) : 0;
            const x = i * (barWidth + gap);
            const y = topPad + (plotHeight - barH);
            return (
              <Rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={Math.min(barWidth / 2, 3)}
                fill={color}
                opacity={0.9}
              />
            );
          })}
          {labels.map((label, i) =>
            i % step === 0 ? (
              <SvgText
                key={i}
                x={i * (barWidth + gap) + barWidth / 2}
                y={chartHeight - 4 * uiScale}
                fontSize={fontSize}
                fill="#71717a"
                textAnchor="middle"
              >
                {label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      )}
    </View>
  );
}

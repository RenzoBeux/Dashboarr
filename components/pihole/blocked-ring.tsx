import { memo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";
import { useAppTheme } from "@/hooks/use-app-theme";

const RING_BASE = 76;
const STROKE_WIDTH = 8;

/**
 * The share of queries Pi-hole blocked, as a donut.
 *
 * Structurally the MetricRing in components/dashboard/server-stats-card.tsx,
 * with one deliberate difference: the arc is a FIXED red rather than that
 * component's ringColor(percent) ramp. That helper goes green -> amber -> red
 * as the number rises because high CPU is bad; here a high block rate is the
 * point, and reusing the ramp would paint a healthy Pi-hole red at 90%.
 *
 * Red here reads as "blocked", matching the query log's blocked dots and the
 * chart's blocked band — not as an alarm. The caption underneath says so
 * explicitly so the colour is never ambiguous.
 */
export const BlockedRing = memo(function BlockedRing({ percent }: { percent: number }) {
  const scale = useUiScale();
  const theme = useAppTheme();

  // react-native-svg props are numeric, so scale by hand rather than with rem.
  const size = Math.round(RING_BASE * scale);
  const stroke = Math.max(4, Math.round(STROKE_WIDTH * scale));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const safePercent =
    typeof percent === "number" && Number.isFinite(percent) ? percent : 0;
  const clamped = Math.min(Math.max(safePercent, 0), 100);
  const offset = circumference * (1 - clamped / 100);

  return (
    <View className="items-center gap-1.5" style={{ minWidth: size + 8 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.surfaceLight}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#ef4444"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-zinc-100 text-base font-bold leading-none">
            {clamped.toFixed(1)}
            <Text className="text-zinc-100 text-[0.6rem] font-semibold">%</Text>
          </Text>
        </View>
      </View>
      <Text className="text-zinc-500 text-[0.7rem] font-semibold uppercase tracking-wider">
        Blocked
      </Text>
    </View>
  );
});

import { View, Text } from "react-native";

export interface MediaStat {
  label: string;
  value: string;
}

interface MediaStatsStripProps {
  stats: MediaStat[];
  className?: string;
}

export function MediaStatsStrip({ stats, className = "" }: MediaStatsStripProps) {
  if (stats.length === 0) return null;
  return (
    <View
      className={`flex-row bg-surface rounded-2xl border border-border py-3 ${className}`}
    >
      {stats.map((stat, i) => (
        <View
          key={stat.label}
          className={`flex-1 px-3 ${i > 0 ? "border-l border-border/60" : ""}`}
        >
          <Text
            className="text-zinc-100 text-sm font-bold"
            numberOfLines={1}
          >
            {stat.value || "—"}
          </Text>
          <Text
            className="text-zinc-500 text-[0.65rem] font-semibold uppercase mt-0.5 tracking-wider"
            numberOfLines={1}
          >
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

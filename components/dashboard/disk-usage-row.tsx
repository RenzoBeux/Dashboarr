import { memo } from "react";
import { View, Text } from "react-native";
import { HardDrive } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { formatBytes } from "@/lib/utils";

// Extracted from server-stats-card's DiskRow so the Glances Server Stats
// widget and the *arr-backed Disk Space widget render mounts identically.
// Percent is caller-owned: Glances reports its own `percent`, the *arr
// /diskspace payload derives it from (total - free) / total.

export function diskBarColor(percent: number): string {
  if (percent >= 85) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-success";
}

export function diskTextColor(percent: number): string {
  if (percent >= 85) return "text-red-400";
  if (percent >= 70) return "text-amber-400";
  return "text-success";
}

interface DiskUsageRowProps {
  label: string; // mount label/path
  percent: number; // 0–100 usage
  used: number; // bytes
  total: number; // bytes
}

export const DiskUsageRow = memo(function DiskUsageRow({
  label,
  percent,
  used,
  total,
}: DiskUsageRowProps) {
  const pct = Math.min(Math.max(percent, 0), 100);
  return (
    <View className="gap-1">
      <View className="flex-row justify-between items-center gap-2">
        <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
          <Icon icon={HardDrive} size={11} color="#a1a1aa" />
          <Text
            className="text-zinc-300 text-xs font-medium"
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
        <Text className="text-zinc-500 text-[0.7rem]">
          {formatBytes(used)} / {formatBytes(total)}
        </Text>
        <Text className={`text-xs font-semibold w-10 text-right ${diskTextColor(pct)}`}>
          {pct.toFixed(0)}%
        </Text>
      </View>
      <View className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${diskBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
});

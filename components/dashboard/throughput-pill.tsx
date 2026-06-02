import { View, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

export interface ThroughputPillProps {
  icon: LucideIcon;
  iconColor: string; // hex — react-native-svg props are numeric/string, not rem
  bgClass: string; // tint, e.g. "bg-blue-600/10"
  valueClass: string; // value text color, e.g. "text-download"
  value: string; // formatted figure, e.g. "8.2 MB/s" or "18.4 Mbps"
  subtitles?: string[]; // muted lines under the value (totals, "WAN"/"LAN", …)
}

/**
 * One half of a two-pill throughput card: an icon + a big value + optional muted
 * subtitles. Shared by Speed Stats (down/up in MB/s) and Streaming Bandwidth
 * (WAN/LAN in Mbps) so both read identically.
 */
export function ThroughputPill({
  icon,
  iconColor,
  bgClass,
  valueClass,
  value,
  subtitles,
}: ThroughputPillProps) {
  return (
    <View className={`flex-1 flex-row items-center gap-3 rounded-xl p-3 ${bgClass}`}>
      <Icon icon={icon} size={18} color={iconColor} />
      {/* `flex-1 min-w-0` lets the text column shrink so a long subtitle
          ellipsizes instead of pushing the pill past 50% of the card. */}
      <View className="flex-1 min-w-0">
        <Text className={`text-lg font-bold ${valueClass}`} numberOfLines={1}>
          {value}
        </Text>
        {subtitles?.map((line) => (
          <Text key={line} className="text-zinc-500 text-xs" numberOfLines={1}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function ThroughputPillSkeleton({ tone }: { tone: "down" | "up" }) {
  const bgClass = tone === "down" ? "bg-blue-600/10" : "bg-green-600/10";
  return (
    <View className={`flex-1 flex-row items-center gap-3 rounded-xl p-3 ${bgClass}`}>
      <Skeleton width={18} height={18} borderRadius={4} />
      <View className="gap-1.5">
        <Skeleton width={80} height={20} />
        <Skeleton width={60} height={12} />
      </View>
    </View>
  );
}

import { View, Text } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransferInfo } from "@/hooks/use-qbittorrent";
import { formatSpeed, formatBytes } from "@/lib/utils";

export function SpeedStatsCard() {
  const { data, isLoading } = useTransferInfo();

  if (isLoading || !data) {
    return (
      <Card className="flex-row gap-3">
        <View className="flex-1 flex-row items-center gap-3 rounded-xl p-3 bg-blue-600/10">
          <Skeleton width={18} height={18} borderRadius={4} />
          <View className="gap-1.5">
            <Skeleton width={80} height={20} />
            <Skeleton width={60} height={12} />
          </View>
        </View>
        <View className="flex-1 flex-row items-center gap-3 rounded-xl p-3 bg-green-600/10">
          <Skeleton width={18} height={18} borderRadius={4} />
          <View className="gap-1.5">
            <Skeleton width={80} height={20} />
            <Skeleton width={60} height={12} />
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card className="flex-row gap-3">
      <SpeedPill
        direction="down"
        speed={formatSpeed(data.dl_info_speed)}
        total={formatBytes(data.dl_info_data)}
      />
      <SpeedPill
        direction="up"
        speed={formatSpeed(data.up_info_speed)}
        total={formatBytes(data.up_info_data)}
      />
    </Card>
  );
}

function SpeedPill({
  direction,
  speed,
  total,
}: {
  direction: "down" | "up";
  speed: string;
  total: string;
}) {
  const isDown = direction === "down";
  const Icon = isDown ? ArrowDown : ArrowUp;
  const colorClass = isDown ? "text-download" : "text-upload";
  const bgClass = isDown ? "bg-blue-600/10" : "bg-green-600/10";

  return (
    <View className={`flex-1 flex-row items-center gap-3 rounded-xl p-3 ${bgClass}`}>
      <Icon size={18} color={isDown ? "#3b82f6" : "#22c55e"} />
      <View>
        <Text className={`text-lg font-bold ${colorClass}`}>{speed}</Text>
        <Text className="text-zinc-500 text-xs">{total} total</Text>
      </View>
    </View>
  );
}

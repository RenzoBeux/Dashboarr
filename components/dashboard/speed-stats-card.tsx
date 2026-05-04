import { View, Text } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransferInfo } from "@/hooks/use-qbittorrent";
import { useRTTransferInfo } from "@/hooks/use-rtorrent";
import { useConfigStore } from "@/store/config-store";
import { formatSpeed, formatBytes } from "@/lib/utils";

export function SpeedStatsCard() {
  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const rtEnabled = useConfigStore((s) => s.services.rtorrent.enabled);
  const activeClient = qbEnabled ? "qbittorrent" : rtEnabled ? "rtorrent" : null;
  const qbActive = activeClient === "qbittorrent";
  const rtActive = activeClient === "rtorrent";

  const { data: qbData, isLoading: qbLoading } = useTransferInfo(qbActive);
  const { data: rtData, isLoading: rtLoading } = useRTTransferInfo(rtActive);

  const isLoading = activeClient === "rtorrent" ? rtLoading : qbLoading;
  const dlSpeed =
    activeClient === "rtorrent" ? rtData?.dl_rate : qbData?.dl_info_speed;
  const upSpeed =
    activeClient === "rtorrent" ? rtData?.up_rate : qbData?.up_info_speed;
  const dlTotal =
    activeClient === "rtorrent" ? rtData?.dl_total : qbData?.dl_info_data;
  const upTotal =
    activeClient === "rtorrent" ? rtData?.up_total : qbData?.up_info_data;

  if (isLoading || (dlSpeed === undefined && upSpeed === undefined)) {
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
        speed={formatSpeed(dlSpeed ?? 0)}
        total={formatBytes(dlTotal ?? 0)}
      />
      <SpeedPill
        direction="up"
        speed={formatSpeed(upSpeed ?? 0)}
        total={formatBytes(upTotal ?? 0)}
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

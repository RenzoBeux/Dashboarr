import { View, Text } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransferInfo } from "@/services/qbittorrent-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import { formatSpeed, formatBytes } from "@/lib/utils";
import {
  SPEED_STATS_DEFAULT_SETTINGS,
  type SpeedStatsSettingsValue,
} from "@/components/dashboard/widget-settings/speed-stats-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function SpeedStatsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<SpeedStatsSettingsValue>(
    slotId,
    SPEED_STATS_DEFAULT_SETTINGS,
  );
  const allInstances = useEnabledInstances("qbittorrent");
  const instances = resolveBoundInstances(settings.instanceIds, allInstances);

  // Fan out across the resolved instances and sum their transfer counters so
  // a single Speed pill represents the whole stack at a glance. Each instance
  // keeps its own cache slot via the [serviceId, instanceId, …] queryKey shape.
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["qbittorrent", inst.id, "transfer"] as const,
      queryFn: () => getTransferInfo(inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  const isLoading = queries.length > 0 && queries.some((q) => q.isLoading);

  if (isLoading || instances.length === 0) {
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

  let dlSpeed = 0;
  let upSpeed = 0;
  let dlTotal = 0;
  let upTotal = 0;
  for (const q of queries) {
    if (!q.data) continue;
    dlSpeed += q.data.dl_info_speed;
    upSpeed += q.data.up_info_speed;
    dlTotal += q.data.dl_info_data;
    upTotal += q.data.up_info_data;
  }

  return (
    <Card className="flex-row gap-3">
      <SpeedPill
        direction="down"
        speed={formatSpeed(dlSpeed)}
        total={formatBytes(dlTotal)}
      />
      <SpeedPill
        direction="up"
        speed={formatSpeed(upSpeed)}
        total={formatBytes(upTotal)}
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
  const ArrowIcon = isDown ? ArrowDown : ArrowUp;
  const colorClass = isDown ? "text-download" : "text-upload";
  const bgClass = isDown ? "bg-blue-600/10" : "bg-green-600/10";

  return (
    <View className={`flex-1 flex-row items-center gap-3 rounded-xl p-3 ${bgClass}`}>
      <Icon icon={ArrowIcon} size={18} color={isDown ? "#3b82f6" : "#22c55e"} />
      <View>
        <Text className={`text-lg font-bold ${colorClass}`}>{speed}</Text>
        <Text className="text-zinc-500 text-xs">{total} total</Text>
      </View>
    </View>
  );
}

import { View, Text } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransferInfo } from "@/services/qbittorrent-api";
import { getSabQueue } from "@/services/sabnzbd-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import { formatSpeed, formatBytes } from "@/lib/utils";
import {
  SPEED_STATS_DEFAULT_SETTINGS,
  type SpeedStatsSettingsValue,
} from "@/components/dashboard/widget-settings/speed-stats-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function SpeedStatsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<SpeedStatsSettingsValue>(
    slotId,
    SPEED_STATS_DEFAULT_SETTINGS,
  );
  const allQbitInstances = useEnabledInstances("qbittorrent");
  const allSabInstances = useEnabledInstances("sabnzbd");
  const qbitInstances = resolveBoundInstances(settings.instanceIds, allQbitInstances);
  // When the user has no qBit configured at all, the toggle is moot — fold any
  // enabled SAB instances in automatically so a SAB-only user sees real numbers
  // instead of a perpetual skeleton. Once they enable qBit, the explicit toggle
  // takes over again.
  const effectiveIncludeSab =
    settings.includeSab || allQbitInstances.length === 0;
  const sabInstances = effectiveIncludeSab
    ? resolveBoundInstances(settings.sabInstanceIds, allSabInstances)
    : [];

  // Fan out across the resolved instances and sum their transfer counters so
  // a single Speed pill represents the whole stack at a glance. Each instance
  // keeps its own cache slot via the [serviceId, instanceId, …] queryKey shape.
  const qbitQueries = useQueries({
    queries: qbitInstances.map((inst) => ({
      queryKey: ["qbittorrent", inst.id, "transfer"] as const,
      queryFn: () => getTransferInfo(inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  // SAB only reports an instantaneous download speed (no upload, no lifetime
  // counter) — it gets folded into the down pill only.
  const sabQueries = useQueries({
    queries: sabInstances.map((inst) => ({
      queryKey: ["sabnzbd", inst.id, "queue"] as const,
      queryFn: () => getSabQueue(inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  // Show the skeleton only on the very first cold load; once any instance has
  // returned a transfer snapshot, keep rendering the summed pill even if one
  // instance later goes offline. The sum gracefully drops to the live
  // instances' contributions instead of flickering back to skeleton on each
  // retry.
  const { isInitialLoading } = aggregateMultiInstanceState([
    ...qbitQueries,
    ...sabQueries,
  ]);

  const hasAnyInstance = qbitInstances.length + sabInstances.length > 0;

  if (isInitialLoading || !hasAnyInstance) {
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
  for (const q of qbitQueries) {
    if (!q.data) continue;
    dlSpeed += q.data.dl_info_speed;
    upSpeed += q.data.up_info_speed;
    dlTotal += q.data.dl_info_data;
    upTotal += q.data.up_info_data;
  }
  for (const q of sabQueries) {
    if (!q.data) continue;
    // SAB returns kbpersec as a string in KB/s; the rest of the card works in
    // bytes/s so normalize here.
    const kbps = parseFloat(q.data.kbpersec);
    if (Number.isFinite(kbps)) dlSpeed += kbps * 1024;
  }

  // Hide the lifetime-total subtitle on the down pill when SAB is in the mix —
  // SAB's queue endpoint exposes no equivalent counter, so the qBit-only sum
  // would silently understate the stack and confuse the user. The settings
  // toggle warns about this; the card just stops showing the misleading number.
  const showDlTotal = sabInstances.length === 0;

  return (
    <Card className="flex-row gap-3">
      <SpeedPill
        direction="down"
        speed={formatSpeed(dlSpeed)}
        total={showDlTotal ? formatBytes(dlTotal) : null}
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
  total: string | null;
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
        {total !== null && (
          <Text className="text-zinc-500 text-xs">{total} total</Text>
        )}
      </View>
    </View>
  );
}

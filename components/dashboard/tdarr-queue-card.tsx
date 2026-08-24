import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getStatistics } from "@/services/tdarr-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  TDARR_QUEUE_DEFAULT_SETTINGS,
  type TdarrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/tdarr-queue-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

function fmt(n: number | string | null | undefined, dp = 1): string {
  const num = typeof n === "string" ? Number(n) : n;
  return typeof num === "number" && Number.isFinite(num) ? num.toFixed(dp) : "—";
}

export function TdarrQueueCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<TdarrQueueSettingsValue>(
    slotId,
    TDARR_QUEUE_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("tdarr", settings.instanceIds);
  const router = useRouter();

  const statsQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["tdarr", inst.id, "statistics"] as const,
      queryFn: () => getStatistics(inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(statsQueries);

  const stats = statsQueries.map((q) => q.data?.[0]).filter((s) => s != null);
  const totalFiles = stats.reduce((sum, s) => sum + (s.totalFileCount ?? 0), 0);
  const totalSaved = stats.reduce((sum, s) => sum + (Number(s.sizeDiff) || 0), 0);
  const avgScore =
    stats.length > 0
      ? stats.reduce((sum, s) => sum + (Number(s.tdarrScore) || 0), 0) / stats.length
      : null;

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || stats.length === 0,
    isLoading: isInitialLoading,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/tdarr")}>
      <CardHeader>
        <CardTitle>Tdarr</CardTitle>
        {avgScore !== null && (
          <Text className="text-zinc-500 text-xs font-medium">{fmt(avgScore, 0)}% healthy</Text>
        )}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Tdarr instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={1} />
      ) : stats.length === 0 ? (
        <EmptyState compact title="No data" />
      ) : (
        <View className="flex-row gap-3">
          <View className="flex-1 bg-surface-light rounded-xl px-3 py-2 items-center">
            <Text className="text-zinc-100 text-sm font-semibold">{totalFiles}</Text>
            <Text className="text-zinc-500 text-xs">Files</Text>
          </View>
          <View className="flex-1 bg-surface-light rounded-xl px-3 py-2 items-center">
            <Text className="text-zinc-100 text-sm font-semibold">{fmt(totalSaved, 1)} GB</Text>
            <Text className="text-zinc-500 text-xs">Saved</Text>
          </View>
        </View>
      )}
    </Card>
  );
}

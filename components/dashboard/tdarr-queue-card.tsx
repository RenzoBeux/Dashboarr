import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
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
import { fmt } from "@/lib/tdarr-format";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

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

  const { isInitialLoading, isAllErrored } = aggregateMultiInstanceState(statsQueries);

  const stats = statsQueries.map((q) => q.data?.[0]).filter((s) => s != null);
  const totalFiles = stats.reduce((sum, s) => sum + (s.totalFileCount ?? 0), 0);
  const totalSaved = stats.reduce((sum, s) => sum + (Number(s.sizeDiff) || 0), 0);
  // healthCheckScore, not tdarrScore: the latter is the transcode/plugin
  // decision score, not a health metric. Tdarr sends both as strings, and an
  // instance can omit them entirely, so average across the ones that actually
  // reported. Counting a missing score as 0 drags the number down: two
  // instances with one missing would read 50% healthy.
  const scores = stats
    .map((s) => (s.healthCheckScore ? Number(s.healthCheckScore) : NaN))
    .filter((n) => Number.isFinite(n));
  const avgScore =
    scores.length > 0 ? scores.reduce((sum, n) => sum + n, 0) / scores.length : null;

  // An all-errored widget stays visible: Tdarr being unreachable is exactly
  // what the user needs to see, not a reason to hide the card. Same stance as
  // download-card.tsx.
  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || (!isAllErrored && stats.length === 0),
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
      ) : isAllErrored ? (
        <EmptyState
          icon={<Icon icon={AlertTriangle} size={32} color="#f59e0b" />}
          title="Couldn't load Tdarr"
          message="Check the server is reachable and the API port is correct."
        />
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

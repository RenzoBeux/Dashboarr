import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getIndexers, getIndexerStatuses } from "@/services/prowlarr-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  PROWLARR_STATS_DEFAULT_SETTINGS,
  type ProwlarrStatsSettingsValue,
} from "@/components/dashboard/widget-settings/prowlarr-stats-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function ProwlarrStatsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<ProwlarrStatsSettingsValue>(
    slotId,
    PROWLARR_STATS_DEFAULT_SETTINGS,
  );
  const allInstances = useEnabledInstances("prowlarr");
  const instances = resolveBoundInstances(settings.instanceIds, allInstances);
  const router = useRouter();

  const indexerQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["prowlarr", inst.id, "indexers"] as const,
      queryFn: () => getIndexers(inst.id),
    })),
  });
  const statusQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["prowlarr", inst.id, "indexerStatuses"] as const,
      queryFn: () => getIndexerStatuses(inst.id),
      refetchInterval: POLLING_INTERVALS.serviceHealth,
    })),
  });

  // Initial-load gate only on the indexer queries — see lib/multi-instance-query.ts.
  // A failing instance's status query just contributes an empty failure set.
  const { isInitialLoading } = aggregateMultiInstanceState(indexerQueries);

  // Tag indexers with their source instance — Prowlarr indexer ids are
  // per-instance, so dedupe by composite key instead of bare id.
  const indexers = indexerQueries.flatMap((q, i) =>
    (q.data ?? []).map((idx) => ({ indexer: idx, instanceId: instances[i].id })),
  );
  // Build a per-instance failure set so we don't false-positive when two
  // instances have an indexer of the same id.
  const failedByInstance = new Map<string, Set<number>>();
  statusQueries.forEach((q, i) => {
    const set = new Set<number>(
      (q.data ?? []).filter((s) => s.disabledTill).map((s) => s.indexerId),
    );
    failedByInstance.set(instances[i].id, set);
  });

  const enabled = indexers.filter(({ indexer }) => indexer.enable);
  const enabledCount = enabled.length;
  const failedCount = enabled.filter(
    ({ indexer, instanceId }) =>
      failedByInstance.get(instanceId)?.has(indexer.id) ?? false,
  ).length;

  return (
    <Card onPress={() => router.push("/(tabs)/indexers")}>
      <CardHeader>
        <CardTitle>Indexers</CardTitle>
        <View className="flex-row gap-2">
          <Badge label={`${enabledCount} active`} variant="success" />
          {failedCount > 0 && (
            <Badge label={`${failedCount} failed`} variant="error" />
          )}
        </View>
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Prowlarr instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={2} />
      ) : enabled.length === 0 ? (
        <EmptyState compact title="No indexers" />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {enabled.slice(0, 8).map(({ indexer, instanceId }) => {
            const isFailed = failedByInstance.get(instanceId)?.has(indexer.id) ?? false;
            return (
              <View
                key={`${instanceId}:${indexer.id}`}
                className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                  isFailed ? "bg-red-600/10" : "bg-surface-light"
                }`}
              >
                <View
                  className={`w-1.5 h-1.5 rounded-full ${
                    isFailed ? "bg-danger" : "bg-success"
                  }`}
                />
                <Text className="text-zinc-400 text-xs">{indexer.name}</Text>
                {isFailed && <Icon icon={AlertTriangle} size={10} color="#ef4444" />}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

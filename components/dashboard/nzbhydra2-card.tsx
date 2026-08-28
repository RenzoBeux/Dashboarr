import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getIndexerStatuses } from "@/services/nzbhydra2-api";
import { hydraStateMeta, isStatsApiGated } from "@/lib/nzbhydra2-normalize";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  NZBHYDRA2_INDEXERS_DEFAULT_SETTINGS,
  type Nzbhydra2IndexersSettingsValue,
} from "@/components/dashboard/widget-settings/nzbhydra2-indexers-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function Nzbhydra2Card({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<Nzbhydra2IndexersSettingsValue>(
    slotId,
    NZBHYDRA2_INDEXERS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("nzbhydra2", settings.instanceIds);
  const router = useRouter();

  const statusQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["nzbhydra2", inst.id, "indexerStatuses"] as const,
      queryFn: () => getIndexerStatuses(inst.id),
      refetchInterval: POLLING_INTERVALS.serviceHealth,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(statusQueries);

  // NZBHydra2 indexers have no id — the display name is the identity, and it is
  // only unique within one server, so tag each row with its source instance and
  // key on the composite.
  const rows = statusQueries.flatMap((q, i) =>
    (q.data ?? []).map((indexer) => ({ indexer, instanceId: instances[i].id })),
  );
  const enabledCount = rows.filter(
    ({ indexer }) => indexer.state === "ENABLED",
  ).length;
  const troubledCount = rows.length - enabledCount;

  // This widget's one endpoint is the allowApiStats-gated one, so distinguish
  // "no indexers" from "the server won't tell us" rather than showing a
  // misleading empty state.
  const allGated =
    rows.length === 0 &&
    statusQueries.length > 0 &&
    statusQueries.every((q) => q.isError && isStatsApiGated(q.error));

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || rows.length === 0,
    isLoading: isInitialLoading,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/indexers?source=nzbhydra2")}>
      <CardHeader>
        <CardTitle>NZBHydra2</CardTitle>
        <View className="flex-row gap-2">
          <Badge label={`${enabledCount} active`} variant="success" />
          {troubledCount > 0 && (
            <Badge label={`${troubledCount} disabled`} variant="error" />
          )}
        </View>
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No NZBHydra2 instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={2} />
      ) : allGated ? (
        <EmptyState compact title="API stats access is off in NZBHydra2" />
      ) : rows.length === 0 ? (
        <EmptyState compact title="No indexers" />
      ) : (
        // Chip cloud: intrinsically-sized items with no width set, so they wrap
        // naturally at every UI scale and a long indexer name pushes the next
        // chip to a new line instead of knocking a grid out of alignment.
        <View className="flex-row flex-wrap gap-2">
          {rows.slice(0, 8).map(({ indexer, instanceId }) => {
            const meta = hydraStateMeta(indexer.state);
            return (
              <View
                key={`${instanceId}:${indexer.indexer}`}
                className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                  indexer.state === "ENABLED" ? "bg-surface-light" : "bg-danger/10"
                }`}
              >
                <View className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                <Text className="text-zinc-400 text-xs">{indexer.indexer}</Text>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

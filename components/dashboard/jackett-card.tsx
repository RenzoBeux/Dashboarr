import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getIndexers } from "@/services/jackett-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import {
  JACKETT_INDEXERS_DEFAULT_SETTINGS,
  type JackettIndexersSettingsValue,
} from "@/components/dashboard/widget-settings/jackett-indexers-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Configured-indexer overview. Unlike the Prowlarr card there are no health
// dots: Jackett has no admin-free per-indexer status endpoint, and faking one
// would mean issuing tracker searches from a dashboard widget.
export function JackettCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<JackettIndexersSettingsValue>(
    slotId,
    JACKETT_INDEXERS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("jackett", settings.instanceIds);
  const router = useRouter();

  const indexerQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["jackett", inst.id, "indexers"] as const,
      queryFn: () => getIndexers(inst.id),
      staleTime: 300000,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(indexerQueries);

  // Jackett indexer ids are per-instance strings — dedupe by composite key.
  const indexers = indexerQueries.flatMap((q, i) =>
    (q.data ?? []).map((idx) => ({ indexer: idx, instanceId: instances[i].id })),
  );

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || indexers.length === 0,
    isLoading: isInitialLoading,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/indexers?source=jackett")}>
      <CardHeader>
        <CardTitle>Jackett</CardTitle>
        <Badge label={`${indexers.length} configured`} variant="success" />
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Jackett instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={2} />
      ) : indexers.length === 0 ? (
        <EmptyState compact title="No indexers" />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {indexers.slice(0, 8).map(({ indexer, instanceId }) => (
            <View
              key={`${instanceId}:${indexer.id}`}
              className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-light"
            >
              <Text className="text-zinc-400 text-xs">{indexer.name}</Text>
              <Text className="text-zinc-600 text-[0.65rem]">{indexer.type}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

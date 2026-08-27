import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getStats } from "@/services/cleanuparr-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import {
  CLEANUPARR_STATS_DEFAULT_SETTINGS,
  type CleanuparrStatsSettingsValue,
} from "@/components/dashboard/widget-settings/cleanuparr-stats-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Cleanup-activity overview — counters are summed across the bound instances,
// health is the union of every instance's connected clients.
export function CleanuparrCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<CleanuparrStatsSettingsValue>(
    slotId,
    CLEANUPARR_STATS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("cleanuparr", settings.instanceIds);
  const router = useRouter();

  const statsQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["cleanuparr", inst.id, "stats", settings.hours] as const,
      queryFn: () => getStats(settings.hours, inst.id),
      staleTime: 60000,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(statsQueries);

  const totals = statsQueries.reduce(
    (acc, q) => {
      if (!q.data) return acc;
      acc.strikes += q.data.strikes.total;
      acc.removed += q.data.removals.total;
      acc.cleaned += q.data.cleaned.total;
      const clients = [...q.data.health.downloadClients, ...q.data.health.arrInstances];
      acc.clients += clients.length;
      acc.healthy += clients.filter((c) => c.isHealthy).length;
      return acc;
    },
    { strikes: 0, removed: 0, cleaned: 0, clients: 0, healthy: 0 },
  );

  const allIdle = totals.strikes === 0 && totals.removed === 0 && totals.cleaned === 0;
  const allHealthy = totals.healthy === totals.clients;

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || (allIdle && allHealthy),
    isLoading: isInitialLoading,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/cleanuparr")}>
      <CardHeader>
        <CardTitle>Cleanuparr</CardTitle>
        {totals.clients > 0 && !allHealthy && (
          <Badge label={`${totals.clients - totals.healthy} unhealthy`} variant="error" />
        )}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Cleanuparr instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={1} />
      ) : (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-x-6 gap-y-1">
            <StatItem
              label="Strikes"
              value={totals.strikes}
              className={totals.strikes > 0 ? "text-amber-400" : "text-zinc-300"}
            />
            <StatItem
              label="Removed"
              value={totals.removed}
              className={totals.removed > 0 ? "text-red-400" : "text-zinc-300"}
            />
            <StatItem label="Cleaned" value={totals.cleaned} className="text-success" />
          </View>
          {totals.clients > 0 && (
            <Text className={`text-xs ${allHealthy ? "text-zinc-500" : "text-red-400"}`}>
              Clients {totals.healthy}/{totals.clients} healthy
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

function StatItem({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className={`text-base font-bold ${className}`}>{value}</Text>
    </View>
  );
}

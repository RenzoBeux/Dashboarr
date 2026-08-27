import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getReleaseStats } from "@/services/autobrr-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import {
  AUTOBRR_STATS_DEFAULT_SETTINGS,
  type AutobrrStatsSettingsValue,
} from "@/components/dashboard/widget-settings/autobrr-stats-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Push-activity overview — counters are summed across the bound instances,
// matching how the multi-instance queue cards aggregate.
export function AutobrrCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<AutobrrStatsSettingsValue>(
    slotId,
    AUTOBRR_STATS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("autobrr", settings.instanceIds);
  const router = useRouter();

  const statsQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["autobrr", inst.id, "stats"] as const,
      queryFn: () => getReleaseStats(inst.id),
      staleTime: 30000,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(statsQueries);

  const totals = statsQueries.reduce(
    (acc, q) => {
      if (!q.data) return acc;
      acc.approved += q.data.push_approved_count;
      acc.rejected += q.data.push_rejected_count;
      acc.errors += q.data.push_error_count;
      acc.total += q.data.total_count;
      return acc;
    },
    { approved: 0, rejected: 0, errors: 0, total: 0 },
  );

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || totals.total === 0,
    isLoading: isInitialLoading,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/autobrr")}>
      <CardHeader>
        <CardTitle>Autobrr</CardTitle>
        {totals.errors > 0 && <Badge label={`${totals.errors} errors`} variant="error" />}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Autobrr instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={1} />
      ) : (
        <View className="flex-row flex-wrap gap-x-6 gap-y-1">
          <StatItem label="Approved" value={totals.approved} className="text-success" />
          <StatItem label="Rejected" value={totals.rejected} className="text-zinc-300" />
          <StatItem
            label="Errors"
            value={totals.errors}
            className={totals.errors > 0 ? "text-red-400" : "text-zinc-300"}
          />
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

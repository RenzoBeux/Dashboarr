import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { ContainerRow } from "@/components/beszel/container-row";
import { HistoryChart } from "@/components/beszel/history-chart";
import { SystemOverview } from "@/components/beszel/system-overview";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBeszelContainers, useBeszelSystems, useBeszelSystemStats } from "@/hooks/use-beszel";

const STATS_LIMIT = 60; // ~1h of 1-minute rollups

export default function BeszelSystemScreen() {
  const { systemId } = useLocalSearchParams<{ systemId: string }>();
  const { refreshing, onRefresh } = usePullToRefresh([["beszel"]]);
  const { data: systems, isLoading, error: systemsError } = useBeszelSystems();
  const system = systems?.find((s) => s.id === systemId);

  const { data: statsPoints, error: statsError } = useBeszelSystemStats(systemId, "1m", STATS_LIMIT);
  const {
    data: containers,
    isLoading: containersLoading,
    error: containersError,
  } = useBeszelContainers(systemId);

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <BackHeader title={system?.name ?? "System"} />

      {isLoading && !system ? (
        <View className="gap-4">
          <Skeleton height={160} />
          <Skeleton height={160} />
        </View>
      ) : !system && systemsError ? (
        <ErrorBanner error={systemsError} title="Couldn't load this system" />
      ) : !system ? (
        <EmptyState title="System not found" message="It may have been removed from the hub." />
      ) : (
        <View className="gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <SystemOverview system={system} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            {statsError && !statsPoints?.length ? (
              <ErrorBanner error={statsError} title="Couldn't load history" />
            ) : (
              <View className="gap-4">
                <HistoryChart points={statsPoints ?? []} metric="cpuPct" color="#3b82f6" label="CPU" />
                <HistoryChart points={statsPoints ?? []} metric="memPct" color="#a855f7" label="Memory" />
              </View>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Containers</CardTitle>
            </CardHeader>
            {containersLoading && !containers ? (
              <Skeleton height={120} />
            ) : containersError && !containers?.length ? (
              <ErrorBanner error={containersError} title="Couldn't load containers" />
            ) : !containers || containers.length === 0 ? (
              <EmptyState compact title="No containers reported" />
            ) : (
              <View>
                {containers.map((c) => (
                  <ContainerRow key={c.id} container={c} />
                ))}
              </View>
            )}
          </Card>

          <Text className="text-zinc-600 text-xs text-center">{system.host}</Text>
        </View>
      )}
    </ScreenWrapper>
  );
}

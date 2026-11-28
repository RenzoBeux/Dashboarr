import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { ContainerRow } from "@/components/beszel/container-row";
import { HistoryChart } from "@/components/beszel/history-chart";
import { SystemOverview } from "@/components/beszel/system-overview";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBeszelContainerStats,
  useBeszelContainers,
  useBeszelSystems,
  useBeszelSystemStats,
} from "@/hooks/use-beszel";
import { buildDockerCharts, buildSystemCharts, type ChartConfig } from "@/lib/beszel-chart-series";
import { BESZEL_RANGE_ORDER, BESZEL_RANGES } from "@/lib/beszel-ranges";
import { lightHaptic } from "@/lib/haptics";
import { useBeszelUiStore } from "@/store/beszel-ui-store";

function ChartList({ charts, timestamps, longFormat }: { charts: ChartConfig[]; timestamps: string[]; longFormat: boolean }) {
  return (
    <View className="gap-5">
      {charts.map((c) => (
        <HistoryChart
          key={c.key}
          label={c.label}
          unit={c.unit}
          series={c.series}
          timestamps={timestamps}
          longFormat={longFormat}
          fixedMax={c.fixedMax}
          subtitle={c.subtitle}
          hiddenCount={c.hiddenCount}
        />
      ))}
    </View>
  );
}

export default function BeszelSystemScreen() {
  const { systemId } = useLocalSearchParams<{ systemId: string }>();
  const { refreshing, onRefresh } = usePullToRefresh([["beszel"]]);
  const { data: systems, isLoading, error: systemsError } = useBeszelSystems();
  const system = systems?.find((s) => s.id === systemId);

  const range = useBeszelUiStore((s) => s.range);
  const setRange = useBeszelUiStore((s) => s.setRange);
  const { longFormat } = BESZEL_RANGES[range];
  const { data: statsPoints, error: statsError } = useBeszelSystemStats(systemId, range);
  const { data: containerPoints } = useBeszelContainerStats(systemId, range);
  const systemCharts = buildSystemCharts(statsPoints ?? []);
  const dockerCharts = buildDockerCharts(containerPoints ?? []);
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
              className="mb-4"
            >
              {BESZEL_RANGE_ORDER.map((r) => (
                <FilterChip
                  key={r}
                  label={BESZEL_RANGES[r].label}
                  selected={r === range}
                  onPress={() => {
                    if (r === range) return;
                    lightHaptic();
                    setRange(r);
                  }}
                />
              ))}
            </ScrollView>
            {statsError && !statsPoints?.length ? (
              <ErrorBanner error={statsError} title="Couldn't load history" />
            ) : statsPoints && systemCharts.length === 0 ? (
              <EmptyState compact title="No history in this range yet" />
            ) : !statsPoints ? (
              <Skeleton height={160} />
            ) : (
              <ChartList
                charts={systemCharts}
                timestamps={statsPoints.map((p) => p.createdAt)}
                longFormat={longFormat}
              />
            )}
          </Card>

          {dockerCharts.length > 0 && containerPoints ? (
            <Card>
              <CardHeader>
                <CardTitle>Docker</CardTitle>
              </CardHeader>
              <ChartList
                charts={dockerCharts}
                timestamps={containerPoints.map((p) => p.createdAt)}
                longFormat={longFormat}
              />
            </Card>
          ) : null}

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

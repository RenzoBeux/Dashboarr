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
import { useBeszelRealtime } from "@/hooks/use-beszel-realtime";
import {
  buildDockerCharts,
  buildSystemCharts,
  historyView,
  liveView,
  type ChartConfig,
} from "@/lib/beszel-chart-series";
import {
  BESZEL_CHART_RANGE_ORDER,
  chartRangeLabel,
  effectiveRange,
  tickFormatFor,
  type TickFormat,
} from "@/lib/beszel-ranges";
import { liveSupported } from "@/lib/beszel-realtime";
import { lightHaptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import { useBeszelUiStore } from "@/store/beszel-ui-store";

const LIVE_STATUS_NOTE = { connecting: "Connecting…", reconnecting: "Reconnecting…" } as const;

function ChartList({ charts, timestamps, tickFormat }: { charts: ChartConfig[]; timestamps: string[]; tickFormat: TickFormat }) {
  return (
    <View className="gap-5">
      {charts.map((c) => (
        <HistoryChart
          key={c.key}
          label={c.label}
          unit={c.unit}
          series={c.series}
          timestamps={timestamps}
          tickFormat={tickFormat}
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

  const storedRange = useBeszelUiStore((s) => s.range);
  const setRange = useBeszelUiStore((s) => s.setRange);
  const liveOk = !!system && liveSupported(system);
  const range = effectiveRange(storedRange, liveOk);
  const isLive = range === "live";
  const historyRange = isLive ? null : range;
  const tickFormat = tickFormatFor(range);

  const {
    data: statsPoints,
    error: statsError,
    isPlaceholderData: statsStale,
  } = useBeszelSystemStats(systemId, historyRange);
  const { data: containerPoints } = useBeszelContainerStats(systemId, historyRange);
  const live = useBeszelRealtime(systemId, isLive);

  const shownStats = isLive ? live.stats : statsPoints;
  const shownContainers = isLive ? live.containers : containerPoints;
  const systemCharts = buildSystemCharts(shownStats ?? []);
  const dockerCharts = buildDockerCharts(shownContainers ?? []);
  const view = isLive
    ? liveView({ status: live.status, charts: systemCharts })
    : historyView({
        error: statsError,
        isPlaceholderData: statsStale,
        hasData: !!statsPoints,
        charts: systemCharts,
      });
  const liveNote = isLive && (live.status === "connecting" || live.status === "reconnecting")
    ? LIVE_STATUS_NOTE[live.status]
    : null;
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
              {BESZEL_CHART_RANGE_ORDER.map((r) => {
                const disabled = r === "live" && !liveOk;
                return (
                  <View key={r} className={disabled ? "opacity-40" : undefined}>
                    <FilterChip
                      label={chartRangeLabel(r)}
                      selected={r === range}
                      onPress={() => {
                        if (disabled) {
                          toast("Live needs a running agent, v0.13 or newer", "info");
                          return;
                        }
                        if (r === range) return;
                        lightHaptic();
                        setRange(r);
                      }}
                    />
                  </View>
                );
              })}
            </ScrollView>
            {liveNote ? <Text className="text-zinc-500 text-xs mb-3">{liveNote}</Text> : null}
            {view === "forbidden" ? (
              <EmptyState
                compact
                title="Live data needs a Beszel user account"
                message="The hub only streams to user accounts with access to this system. A superuser login isn't enough: add a regular user with the same email and password, or share this system with yours."
              />
            ) : view === "error" ? (
              <ErrorBanner error={statsError} title="Couldn't load history" />
            ) : view === "loading" || !shownStats ? (
              <Skeleton height={160} />
            ) : view === "empty" ? (
              <EmptyState compact title="No history in this range yet" />
            ) : (
              <ChartList
                charts={systemCharts}
                timestamps={shownStats.map((p) => p.createdAt)}
                tickFormat={tickFormat}
              />
            )}
          </Card>

          {dockerCharts.length > 0 && shownContainers ? (
            <Card>
              <CardHeader>
                <CardTitle>Docker</CardTitle>
              </CardHeader>
              <ChartList
                charts={dockerCharts}
                timestamps={shownContainers.map((p) => p.createdAt)}
                tickFormat={tickFormat}
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

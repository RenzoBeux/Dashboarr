import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useQueries } from "@tanstack/react-query";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PlaysBarChart } from "@/components/tautulli/plays-bar-chart";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getHomeStats,
  getPlaysByDate,
  getPlaysByDayOfWeek,
  getPlaysByHourOfDay,
} from "@/services/tautulli-api";
import type {
  TautulliHomeStat,
  TautulliHomeStatRow,
  TautulliPlaysChart,
} from "@/lib/types";

type Range = 7 | 30;

// Collapse a get_plays_by_* response's per-media-type series into one total per
// category (the chart shows total plays).
function totals(chart: TautulliPlaysChart | undefined): number[] {
  if (!chart) return [];
  const len = chart.categories.length;
  const out = new Array<number>(len).fill(0);
  for (const s of chart.series) {
    for (let i = 0; i < len; i++) out[i] += s.data[i] ?? 0;
  }
  return out;
}

// "2024-06-01" → "6/1"
function shortDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parseInt(parts[1]!, 10)}/${parseInt(parts[2]!, 10)}`;
}

export default function TautulliStatsScreen() {
  const [range, setRange] = useState<Range>(30);
  const tautulli = useEnabledInstances("tautulli");
  const instanceId = tautulli[0]?.id;

  const queries = useQueries({
    queries: [
      {
        queryKey: ["tautulli", instanceId, "plays_by_date", range] as const,
        queryFn: () => getPlaysByDate(range, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
      {
        queryKey: ["tautulli", instanceId, "plays_by_dow", range] as const,
        queryFn: () => getPlaysByDayOfWeek(range, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
      {
        queryKey: ["tautulli", instanceId, "plays_by_hod", range] as const,
        queryFn: () => getPlaysByHourOfDay(range, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
      {
        queryKey: ["tautulli", instanceId, "home_stats", range] as const,
        queryFn: () => getHomeStats(range, 5, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
    ],
  });

  const [byDate, byDow, byHod, homeStats] = queries;
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error;

  if (!instanceId) {
    return (
      <ScreenWrapper>
        <BackHeader title="Tautulli Stats" />
        <EmptyState
          title="No Tautulli configured"
          message="Enable Tautulli in Settings to see stats"
        />
      </ScreenWrapper>
    );
  }

  const topUsers =
    (homeStats.data as TautulliHomeStat[] | undefined)?.find(
      (s) => s.stat_id === "top_users",
    )?.rows ?? [];

  return (
    <ScreenWrapper>
      <BackHeader title="Tautulli Stats" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {([7, 30] as Range[]).map((r) => (
          <FilterChip
            key={r}
            label={`Last ${r} days`}
            selected={range === r}
            onPress={() => setRange(r)}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <SkeletonCardContent rows={4} />
      ) : error && queries.every((q) => q.error) ? (
        <ErrorBanner error={error} title="Failed to load stats" />
      ) : (
        <View className="gap-4">
          <ChartCard title="Plays by day">
            <PlaysBarChart
              values={totals(byDate.data)}
              labels={(byDate.data?.categories ?? []).map(shortDate)}
              maxLabels={6}
            />
          </ChartCard>

          <ChartCard title="By day of week">
            <PlaysBarChart
              values={totals(byDow.data)}
              labels={(byDow.data?.categories ?? []).map((c) => c.slice(0, 3))}
              maxLabels={7}
            />
          </ChartCard>

          <ChartCard title="By hour of day">
            <PlaysBarChart
              values={totals(byHod.data)}
              labels={(byHod.data?.categories ?? []).map((c) =>
                String(parseInt(c, 10)),
              )}
              maxLabels={7}
            />
          </ChartCard>

          <Card>
            <Text className="text-zinc-400 text-xs font-semibold uppercase mb-3">
              Most active users
            </Text>
            {topUsers.length === 0 ? (
              <Text className="text-zinc-500 text-sm">No data</Text>
            ) : (
              <TopUsers rows={topUsers} />
            )}
          </Card>
        </View>
      )}
    </ScreenWrapper>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Text className="text-zinc-400 text-xs font-semibold uppercase mb-3">
        {title}
      </Text>
      {children}
    </Card>
  );
}

function TopUsers({ rows }: { rows: TautulliHomeStatRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total_plays ?? 0));
  return (
    <View className="gap-3">
      {rows.map((r, i) => {
        const plays = r.total_plays ?? 0;
        return (
          <View key={i} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-zinc-200 text-sm flex-1 mr-2" numberOfLines={1}>
                {r.friendly_name || r.user || "Unknown"}
              </Text>
              <Text className="text-zinc-400 text-xs">
                {plays} {plays === 1 ? "play" : "plays"}
              </Text>
            </View>
            <ProgressBar progress={plays / max} />
          </View>
        );
      })}
    </View>
  );
}

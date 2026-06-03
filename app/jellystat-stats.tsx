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
  getMostActiveUsers,
  getViewsByDays,
  getViewsByHour,
  getViewsOverTime,
} from "@/services/jellystat-api";
import type {
  JellystatActiveUser,
  JellystatViewBucket,
  JellystatViewsResponse,
  JellystatViewStat,
} from "@/lib/types";

type Range = 7 | 30;

// JellyStat's bar-chart glyph is a violet→blue gradient; tint the charts violet
// to read as JellyStat (Tautulli's screen uses the default blue).
const CHART_COLOR = "#8b5cf6";

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// Sum the per-library counts in one getViews* row into a single total. A row is
// { Key, [libraryName]: { count, duration } } — skip Key, coerce the bigint
// `count` (node-postgres serializes it as a string).
function rowTotal(row: JellystatViewStat): number {
  let total = 0;
  for (const [key, value] of Object.entries(row)) {
    if (key === "Key") continue;
    if (value && typeof value === "object") {
      total += Number((value as JellystatViewBucket).count) || 0;
    }
  }
  return total;
}

// Reduce a getViews* response into ordered { labels, values } for PlaysBarChart.
// `sortKey` re-orders buckets client-side (hours numerically, days by weekday)
// so the x-axis is correct regardless of the server's row order.
function toSeries(
  res: JellystatViewsResponse | undefined,
  label: (key: string) => string,
  sortKey?: (key: string) => number,
): { labels: string[]; values: number[] } {
  const stats = res?.stats ?? [];
  const rows = sortKey
    ? [...stats].sort((a, b) => sortKey(String(a.Key)) - sortKey(String(b.Key)))
    : stats;
  return {
    labels: rows.map((r) => label(String(r.Key))),
    values: rows.map(rowTotal),
  };
}

export default function JellystatStatsScreen() {
  const [range, setRange] = useState<Range>(30);
  const jellystat = useEnabledInstances("jellystat");
  const instanceId = jellystat[0]?.id;

  const queries = useQueries({
    queries: [
      {
        queryKey: ["jellystat", instanceId, "views_over_time", range] as const,
        queryFn: () => getViewsOverTime(range, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
      {
        queryKey: ["jellystat", instanceId, "views_by_days", range] as const,
        queryFn: () => getViewsByDays(range, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
      {
        queryKey: ["jellystat", instanceId, "views_by_hour", range] as const,
        queryFn: () => getViewsByHour(range, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
      {
        queryKey: ["jellystat", instanceId, "active_users", range] as const,
        queryFn: () => getMostActiveUsers(range, instanceId),
        enabled: !!instanceId,
        refetchInterval: POLLING_INTERVALS.calendar,
      },
    ],
  });

  const [overTime, byDays, byHour, activeUsers] = queries;
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error;

  if (!instanceId) {
    return (
      <ScreenWrapper>
        <BackHeader title="JellyStat Stats" />
        <EmptyState
          title="No JellyStat configured"
          message="Enable JellyStat in Settings to see stats"
        />
      </ScreenWrapper>
    );
  }

  // Over time: strip the year off "Jun 03, 2026"; server returns chronological.
  const overTimeSeries = toSeries(overTime.data, (k) => k.split(",")[0] ?? k);
  // Day of week: 3-letter label, sorted Sun→Sat.
  const byDaysSeries = toSeries(
    byDays.data,
    (k) => k.slice(0, 3),
    (k) => DAY_INDEX[k] ?? 0,
  );
  // Hour of day: numeric label, sorted 0→23.
  const byHourSeries = toSeries(
    byHour.data,
    (k) => String(parseInt(k, 10)),
    (k) => Number(k),
  );

  const users = (activeUsers.data ?? []) as JellystatActiveUser[];

  return (
    <ScreenWrapper>
      <BackHeader title="JellyStat Stats" />

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
              values={overTimeSeries.values}
              labels={overTimeSeries.labels}
              maxLabels={6}
              color={CHART_COLOR}
            />
          </ChartCard>

          <ChartCard title="By day of week">
            <PlaysBarChart
              values={byDaysSeries.values}
              labels={byDaysSeries.labels}
              maxLabels={7}
              color={CHART_COLOR}
            />
          </ChartCard>

          <ChartCard title="By hour of day">
            <PlaysBarChart
              values={byHourSeries.values}
              labels={byHourSeries.labels}
              maxLabels={7}
              color={CHART_COLOR}
            />
          </ChartCard>

          <Card>
            <Text className="text-zinc-400 text-xs font-semibold uppercase mb-3">
              Most active users
            </Text>
            {users.length === 0 ? (
              <Text className="text-zinc-500 text-sm">No data</Text>
            ) : (
              <TopUsers users={users} />
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

function TopUsers({ users }: { users: JellystatActiveUser[] }) {
  const counts = users.map((u) => Number(u.Plays) || 0);
  const max = Math.max(1, ...counts);
  return (
    <View className="gap-3">
      {users.map((u, i) => {
        const plays = counts[i]!;
        return (
          <View key={u.UserId ?? i} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-zinc-200 text-sm flex-1 mr-2" numberOfLines={1}>
                {u.Name || "Unknown"}
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

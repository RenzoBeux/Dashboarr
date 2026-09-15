import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Filter, Network } from "lucide-react-native";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { BlockedRing } from "@/components/pihole/blocked-ring";
import { ProtectionControl } from "@/components/adguard/protection-control";
import { QueriesOverTimeChart } from "@/components/adguard/queries-over-time-chart";
import { QueryRow } from "@/components/adguard/query-row";
import { TopList, type TopListRow } from "@/components/pihole/top-list";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { toTopListRows } from "@/lib/adguard-normalize";
import {
  useAdguardFilterStatus,
  useAdguardLiveQueryLog,
  useAdguardRewrites,
  useAdguardStats,
  useRefreshAdguardFilters,
  ADGUARD_PREVIEW_POLL_MS,
} from "@/hooks/use-adguard";
import { useServiceHealth } from "@/hooks/use-service-health";
import { ICON } from "@/lib/constants";
import { formatIsoAgo } from "@/lib/adguard-format";

const TOP_COUNT = 10;
const PREVIEW_QUERY_COUNT = 5;
const PREVIEW_REWRITE_COUNT = 3;

export default function AdguardScreen() {
  return (
    <WorkspaceServiceGuard kinds={["adguard"]}>
      <AdguardScreenInner />
    </WorkspaceServiceGuard>
  );
}

function AdguardScreenInner() {
  const { data: healthData } = useServiceHealth();
  // One kind-prefix key: every AdGuard Home query key starts
  // ["adguard", instanceId], so this invalidates the whole screen and both
  // sub-screens at once.
  const { refreshing, onRefresh } = usePullToRefresh([["adguard"]]);
  const health = healthData?.find((s) => s.id === "adguard");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {/* ServiceHeader renders the instance switcher itself when more than one
          AdGuard Home is configured, and every card below resolves through
          useInstanceTarget, so the whole screen re-scopes on switch. */}
      <ServiceHeader name="AdGuard Home" online={health?.online} serviceId="adguard" />
      <CachedDataBanner serviceId="adguard" label="AdGuard Home" />

      <View className="gap-4">
        {/* Actions the user opened the app for come first. */}
        <ProtectionControl />
        <StatsCard />
        <ActivityCard />
        <TopListsCard />
        <FilteringCard />
        <RecentQueriesCard />
        <LocalDnsCard />
      </View>
    </ScreenWrapper>
  );
}

function StatsCard() {
  const { data, isLoading } = useAdguardStats();

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This window</CardTitle>
        </CardHeader>
        <SkeletonCardContent rows={2} />
      </Card>
    );
  }
  if (!data) return null;

  if (data.num_dns_queries === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This window</CardTitle>
        </CardHeader>
        <EmptyState compact title="No queries yet" />
      </Card>
    );
  }

  const percentBlocked = (data.num_blocked_filtering / data.num_dns_queries) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>This window</CardTitle>
      </CardHeader>
      <View className="flex-row items-center gap-4">
        <BlockedRing percent={percentBlocked} />
        <View className="flex-1 flex-row flex-wrap gap-x-6 gap-y-3">
          <StatItem label="Queries" value={data.num_dns_queries.toLocaleString()} />
          <StatItem
            label="Blocked"
            value={data.num_blocked_filtering.toLocaleString()}
            className="text-danger"
          />
          <StatItem
            label="Safe Browsing"
            value={data.num_replaced_safebrowsing.toLocaleString()}
          />
          <StatItem
            label="Avg. response"
            value={`${Math.round(data.avg_processing_time * 1000)}ms`}
          />
        </View>
      </View>
    </Card>
  );
}

function StatItem({
  label,
  value,
  className = "text-zinc-100",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className={`text-base font-semibold ${className}`}>{value}</Text>
    </View>
  );
}

function ActivityCard() {
  const { data, isLoading, dataUpdatedAt } = useAdguardStats();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queries over time</CardTitle>
      </CardHeader>
      {isLoading && !data ? (
        <SkeletonCardContent rows={3} />
      ) : (
        <QueriesOverTimeChart
          dnsQueries={data?.dns_queries ?? []}
          blockedFiltering={data?.blocked_filtering ?? []}
          timeUnits={data?.time_units ?? "hours"}
          asOfMs={dataUpdatedAt || Date.now()}
        />
      )}
    </Card>
  );
}

const TOP_TABS = [
  { key: "blocked", label: "Blocked" },
  { key: "queried", label: "Queried" },
  { key: "clients", label: "Clients" },
] as const;

type TopTab = (typeof TOP_TABS)[number]["key"];

function TopListsCard() {
  const [tab, setTab] = useState<TopTab>("blocked");
  const { data, isLoading } = useAdguardStats();

  const rows: TopListRow[] =
    tab === "blocked"
      ? toTopListRows(data?.top_blocked_domains)
      : tab === "queried"
        ? toTopListRows(data?.top_queried_domains)
        : toTopListRows(data?.top_clients);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top</CardTitle>
      </CardHeader>
      {/* Chip rows always live in a horizontal ScrollView — at a higher UI
          scale they grow with rem and would otherwise clip off-screen. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-3"
      >
        {TOP_TABS.map((t) => (
          <FilterChip
            key={t.key}
            label={t.label}
            selected={tab === t.key}
            onPress={() => setTab(t.key)}
          />
        ))}
      </ScrollView>
      {isLoading && !data ? (
        <SkeletonCardContent rows={5} />
      ) : rows.slice(0, TOP_COUNT).length === 0 ? (
        <EmptyState compact title="No data yet" />
      ) : (
        <TopList rows={rows.slice(0, TOP_COUNT)} blocked={tab === "blocked"} />
      )}
    </Card>
  );
}

function FilteringCard() {
  const { data, isLoading } = useAdguardFilterStatus();
  const refresh = useRefreshAdguardFilters();

  const filters = data?.filters ?? [];
  const enabledCount = filters.filter((f) => f.enabled).length;
  const totalRules = filters.reduce((sum, f) => sum + (f.enabled ? f.rules_count : 0), 0);
  const lastUpdated = filters.reduce<string | undefined>(
    (latest, f) => (!latest || (f.last_updated && f.last_updated > latest) ? f.last_updated : latest),
    undefined,
  );

  const run = () => {
    refresh.mutate(false, {
      onSuccess: (result) => toast(`${result.updated} filter list(s) updated`),
      onError: (err) => toastError("Filter update failed", err),
    });
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Filter} size={ICON.MD} color="#a1a1aa" />
          <CardTitle>Filter lists</CardTitle>
        </View>
      </CardHeader>
      {isLoading && !data ? (
        <SkeletonCardContent rows={2} />
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-6">
            <StatItem label="Enabled lists" value={`${enabledCount} / ${filters.length}`} />
            <StatItem label="Rules" value={totalRules.toLocaleString()} />
            <StatItem label="Last updated" value={formatIsoAgo(lastUpdated)} />
          </View>
          <Button
            label="Update filters"
            variant="outline"
            loading={refresh.isPending}
            onPress={run}
          />
        </View>
      )}
    </Card>
  );
}

function RecentQueriesCard() {
  const router = useRouter();
  // A different filter object from the log screen's, so this cheap 5-row
  // preview has its own cache entry and does not drag the live poll along.
  const { data, isLoading } = useAdguardLiveQueryLog(
    { limit: PREVIEW_QUERY_COUNT },
    true,
    undefined,
    ADGUARD_PREVIEW_POLL_MS,
  );
  const rows = (data?.data ?? []).slice(0, PREVIEW_QUERY_COUNT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent queries</CardTitle>
        <Pressable
          onPress={() => router.push("/adguard/queries")}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Text className="text-primary text-sm">View all</Text>
          <Icon icon={ChevronRight} size={ICON.XS} color="#3b82f6" />
        </Pressable>
      </CardHeader>
      {isLoading && !data ? (
        <SkeletonCardContent rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState compact title="No recent queries" />
      ) : (
        <View className="gap-3">
          {rows.map((q) => (
            <QueryRow key={`${q.time}-${q.question.name}`} query={q} />
          ))}
        </View>
      )}
    </Card>
  );
}

function LocalDnsCard() {
  const router = useRouter();
  const { data, isLoading } = useAdguardRewrites();
  const records = data ?? [];

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Network} size={ICON.MD} color="#a1a1aa" />
          <CardTitle>Local DNS</CardTitle>
        </View>
        <Pressable
          onPress={() => router.push("/adguard/rewrites")}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Text className="text-primary text-sm">Manage</Text>
          <Icon icon={ChevronRight} size={ICON.XS} color="#3b82f6" />
        </Pressable>
      </CardHeader>
      {isLoading && !data ? (
        <SkeletonCardContent rows={2} />
      ) : records.length === 0 ? (
        <EmptyState compact title="No local DNS records" />
      ) : (
        <View className="gap-2">
          {records.slice(0, PREVIEW_REWRITE_COUNT).map((r) => (
            <View key={`${r.domain}-${r.answer}`} className="flex-row items-center gap-2">
              <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
                {r.domain}
              </Text>
              <Text className="text-zinc-500 text-xs flex-1" numberOfLines={1}>
                {r.answer}
              </Text>
            </View>
          ))}
          {records.length > PREVIEW_REWRITE_COUNT ? (
            <Text className="text-zinc-600 text-xs">
              +{records.length - PREVIEW_REWRITE_COUNT} more
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

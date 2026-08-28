import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Network, RefreshCw } from "lucide-react-native";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { BlockedRing } from "@/components/pihole/blocked-ring";
import { BlockingControl } from "@/components/pihole/blocking-control";
import { QueriesOverTimeChart } from "@/components/pihole/queries-over-time-chart";
import { QueryRow } from "@/components/pihole/query-row";
import { TopList, type TopListRow } from "@/components/pihole/top-list";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { isAbortError } from "@/lib/http-client";
import {
  usePiholeCnameRecords,
  usePiholeHistory,
  usePiholeLiveQueries,
  usePiholeSummary,
  usePiholeTopClients,
  usePiholeTopDomains,
  useRunPiholeGravity,
  PIHOLE_PREVIEW_POLL_MS,
} from "@/hooks/use-pihole";
import { useServiceHealth } from "@/hooks/use-service-health";
import { ICON } from "@/lib/constants";
import { formatUnixAgo } from "@/lib/pihole-format";
import { piholeErrorMessage } from "@/lib/pihole-normalize";

const TOP_COUNT = 10;
const PREVIEW_QUERY_COUNT = 5;
const PREVIEW_CNAME_COUNT = 3;

export default function PiholeScreen() {
  return (
    <WorkspaceServiceGuard kinds={["pihole"]}>
      <PiholeScreenInner />
    </WorkspaceServiceGuard>
  );
}

function PiholeScreenInner() {
  const { data: healthData } = useServiceHealth();
  // One kind-prefix key: every Pi-hole query key starts ["pihole", instanceId],
  // so this invalidates the whole screen and both sub-screens at once.
  const { refreshing, onRefresh } = usePullToRefresh([["pihole"]]);
  const health = healthData?.find((s) => s.id === "pihole");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {/* ServiceHeader renders the instance switcher itself when more than one
          Pi-hole is configured, and every card below resolves through
          useInstanceTarget, so the whole screen re-scopes on switch. */}
      <ServiceHeader name="Pi-hole" online={health?.online} serviceId="pihole" />
      <CachedDataBanner serviceId="pihole" label="Pi-hole" />

      <View className="gap-4">
        {/* Actions the user opened the app for come first. */}
        <BlockingControl />
        <StatsCard />
        <ActivityCard />
        <TopListsCard />
        <GravityCard />
        <RecentQueriesCard />
        <LocalDnsCard />
      </View>
    </ScreenWrapper>
  );
}

function StatsCard() {
  const { data, isLoading } = usePiholeSummary();

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Last 24 hours</CardTitle>
        </CardHeader>
        <SkeletonCardContent rows={2} />
      </Card>
    );
  }
  if (!data) return null;

  const { queries, clients } = data;
  if (queries.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Last 24 hours</CardTitle>
        </CardHeader>
        <EmptyState compact title="No queries yet" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 24 hours</CardTitle>
      </CardHeader>
      <View className="flex-row items-center gap-4">
        <BlockedRing percent={queries.percent_blocked} />
        <View className="flex-1 flex-row flex-wrap gap-x-6 gap-y-3">
          <StatItem label="Queries" value={queries.total.toLocaleString()} />
          <StatItem
            label="Blocked"
            value={queries.blocked.toLocaleString()}
            className="text-danger"
          />
          <StatItem
            label="Unique domains"
            value={queries.unique_domains.toLocaleString()}
          />
          <StatItem
            label="Active clients"
            value={String(clients.active)}
            sub={`of ${clients.total}`}
          />
        </View>
      </View>
    </Card>
  );
}

function StatItem({
  label,
  value,
  sub,
  className = "text-zinc-100",
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className={`text-base font-semibold ${className}`}>{value}</Text>
      {sub ? <Text className="text-zinc-600 text-xs">{sub}</Text> : null}
    </View>
  );
}

function ActivityCard() {
  const { data, isLoading } = usePiholeHistory();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queries over time</CardTitle>
      </CardHeader>
      {isLoading && !data ? (
        <SkeletonCardContent rows={3} />
      ) : (
        <QueriesOverTimeChart history={data ?? []} />
      )}
    </Card>
  );
}

const TOP_TABS = [
  { key: "blocked", label: "Blocked" },
  { key: "permitted", label: "Permitted" },
  { key: "clients", label: "Clients" },
] as const;

type TopTab = (typeof TOP_TABS)[number]["key"];

function TopListsCard() {
  const [tab, setTab] = useState<TopTab>("blocked");

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
      {/* Only the selected list is mounted, so the other hooks never fetch. */}
      {tab === "clients" ? <TopClientsList /> : <TopDomainsList blocked={tab === "blocked"} />}
    </Card>
  );
}

function TopDomainsList({ blocked }: { blocked: boolean }) {
  const { data, isLoading } = usePiholeTopDomains(blocked, TOP_COUNT);
  if (isLoading && !data) return <SkeletonCardContent rows={5} />;
  const rows: TopListRow[] = (data?.domains ?? []).map((d) => ({
    title: d.domain,
    count: d.count,
  }));
  if (!rows.length) return <EmptyState compact title="No data yet" />;
  return <TopList rows={rows} blocked={blocked} />;
}

function TopClientsList() {
  const { data, isLoading } = usePiholeTopClients(TOP_COUNT);
  if (isLoading && !data) return <SkeletonCardContent rows={5} />;
  const rows: TopListRow[] = (data?.clients ?? []).map((c) => ({
    title: c.name || c.ip,
    // Only show the IP as a second line when the name is what we led with.
    subtitle: c.name ? c.ip : undefined,
    count: c.count,
  }));
  if (!rows.length) return <EmptyState compact title="No data yet" />;
  return <TopList rows={rows} />;
}

function GravityCard() {
  const { data: summary } = usePiholeSummary();
  const gravity = useRunPiholeGravity();
  const [confirmVisible, setConfirmVisible] = useState(false);
  // `gravity.last_update` at the moment a run we lost the connection to
  // started. While this is set, gravity is still going server-side even though
  // no request of ours is in flight — the button stays disabled so the user
  // cannot kick off a second concurrent run, and it clears when the timestamp
  // advances past it. That is the only completion signal available: the request
  // cannot be cancelled and its abort tells us nothing about the run.
  const [detachedSince, setDetachedSince] = useState<number | null>(null);

  const lastUpdate = summary?.gravity.last_update ?? 0;
  if (detachedSince !== null && lastUpdate > detachedSince) {
    // Render-phase setState on a changed prop is the supported "derive state
    // from props" pattern; React re-renders immediately without committing.
    setDetachedSince(null);
  }

  const running = gravity.isPending || detachedSince !== null;

  const run = () => {
    setConfirmVisible(false);
    setDetachedSince(null);
    gravity.mutate(undefined, {
      onSuccess: (result) => {
        if (result.status === "partial") {
          toast(
            `Gravity updated, but ${result.failures.length} list${
              result.failures.length === 1 ? "" : "s"
            } could not be reached`,
            "info",
          );
        } else if (result.status === "failed") {
          toast("Gravity did not finish — check Pi-hole's own logs", "error");
        } else {
          toast("Gravity updated");
        }
      },
      onError: (err) => {
        // An abort means our five-minute read window elapsed, NOT that gravity
        // failed: the request cannot be cancelled, so `pihole -g` keeps running
        // server-side. Reporting failure here would invite the user to start a
        // second concurrent update. Stay in the running state instead and let
        // gravity.last_update confirm completion — the summary query polls on
        // its own, so no invalidation is needed.
        if (isAbortError(err)) {
          setDetachedSince(lastUpdate);
          toast(
            "Still updating. Gravity keeps running on the Pi-hole; this will clear when it finishes.",
            "info",
          );
          return;
        }
        toastError("Gravity update failed", err, piholeErrorMessage);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={RefreshCw} size={ICON.MD} color="#a1a1aa" />
          <CardTitle>Gravity</CardTitle>
        </View>
      </CardHeader>
      <View className="gap-3">
        <View className="flex-row gap-6">
          <StatItem
            label="Domains blocked"
            value={(summary?.gravity.domains_being_blocked ?? 0).toLocaleString()}
          />
          <StatItem
            label="Last updated"
            value={formatUnixAgo(summary?.gravity.last_update ?? 0)}
          />
        </View>
        <Button
          label="Update Gravity"
          variant="outline"
          loading={running}
          onPress={() => setConfirmVisible(true)}
        />
        {/* Inline and non-blocking on purpose: a modal would lock the user out
            of the blocking toggle for minutes over an operation that needs no
            attention. The request also cannot be cancelled, so we never claim
            failure on a timeout — the card's "Last updated" is the real signal. */}
        {running ? (
          <Text className="text-zinc-500 text-xs leading-4">
            Updating gravity. This can take several minutes and keeps running
            even if you close the app.
          </Text>
        ) : null}
      </View>

      <ConfirmModal
        visible={confirmVisible}
        title="Update gravity"
        message="Re-download every blocklist and rebuild the gravity database. This can take one to two minutes; blocking keeps working while it runs."
        icon={RefreshCw}
        confirmLabel="Update"
        onConfirm={run}
        onCancel={() => setConfirmVisible(false)}
      />
    </Card>
  );
}

function RecentQueriesCard() {
  const router = useRouter();
  // A different filter object from the log screen's, so this cheap 5-row
  // preview has its own cache entry and does not drag the live poll along.
  const { data, isLoading } = usePiholeLiveQueries(
    { length: PREVIEW_QUERY_COUNT },
    true,
    undefined,
    PIHOLE_PREVIEW_POLL_MS,
  );
  const rows = (data?.queries ?? []).slice(0, PREVIEW_QUERY_COUNT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent queries</CardTitle>
        <Pressable
          onPress={() => router.push("/pihole/queries")}
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
            <QueryRow key={q.id} query={q} />
          ))}
        </View>
      )}
    </Card>
  );
}

function LocalDnsCard() {
  const router = useRouter();
  const { data, isLoading } = usePiholeCnameRecords();
  const records = data ?? [];

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Network} size={ICON.MD} color="#a1a1aa" />
          <CardTitle>Local DNS</CardTitle>
        </View>
        <Pressable
          onPress={() => router.push("/pihole/cnames")}
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
          {records.slice(0, PREVIEW_CNAME_COUNT).map((r) => (
            <View key={r.raw} className="flex-row items-center gap-2">
              <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
                {r.cname}
              </Text>
              <Text className="text-zinc-500 text-xs flex-1" numberOfLines={1}>
                {r.target}
              </Text>
            </View>
          ))}
          {records.length > PREVIEW_CNAME_COUNT ? (
            <Text className="text-zinc-600 text-xs">
              +{records.length - PREVIEW_CNAME_COUNT} more
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

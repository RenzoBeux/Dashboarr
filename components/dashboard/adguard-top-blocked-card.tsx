import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { TopList, type TopListRow } from "@/components/pihole/top-list";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { adguardKeys } from "@/hooks/use-adguard";
import { getStats } from "@/services/adguard-api";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { toTopListRows } from "@/lib/adguard-normalize";
import {
  ADGUARD_TOP_BLOCKED_DEFAULT_SETTINGS,
  type AdguardTopBlockedSettingsValue,
} from "@/components/dashboard/widget-settings/adguard-top-blocked-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { AdguardStats } from "@/lib/types";

const STATS_STALE_MS = 30_000;

/**
 * The most-blocked domains across every bound AdGuard Home.
 *
 * Reads the same /control/stats each instance's status card already fetches
 * (same query key), so a dashboard with both widgets never double-fetches.
 */
export function AdguardTopBlockedCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<AdguardTopBlockedSettingsValue>(
    slotId,
    ADGUARD_TOP_BLOCKED_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("adguard", settings.instanceIds);
  const router = useRouter();

  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: adguardKeys.stats(inst.id),
      queryFn: () => getStats(undefined, inst.id),
      staleTime: STATS_STALE_MS,
      refetchInterval: STATS_STALE_MS,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  // Merge by SUMMING per domain. An HA pair of AdGuard Homes serves different
  // clients, so concatenating would list the same domain twice with two
  // partial counts instead of once with the real total.
  const merged = new Map<string, number>();
  for (const q of queries) {
    const stats = q.data as AdguardStats | undefined;
    for (const row of toTopListRows(stats?.top_blocked_domains)) {
      merged.set(row.title, (merged.get(row.title) ?? 0) + row.count);
    }
  }
  const rows: TopListRow[] = [...merged.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, settings.maxItems);

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: rows.length === 0,
    isLoading: isInitialLoading,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/adguard")}>
      <CardHeader>
        <CardTitle>Top Blocked Domains</CardTitle>
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No AdGuard Home instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={settings.maxItems > 5 ? 5 : settings.maxItems} />
      ) : rows.length === 0 ? (
        <EmptyState compact title="Nothing blocked yet" />
      ) : (
        <TopList rows={rows} blocked />
      )}
    </Card>
  );
}

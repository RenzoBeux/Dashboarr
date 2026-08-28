import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { TopList, type TopListRow } from "@/components/pihole/top-list";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { piholeKeys } from "@/hooks/use-pihole";
import { getTopDomains } from "@/services/pihole-api";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import {
  PIHOLE_TOP_BLOCKED_DEFAULT_SETTINGS,
  type PiholeTopBlockedSettingsValue,
} from "@/components/dashboard/widget-settings/pihole-top-blocked-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { PiholeTopDomainsResponse } from "@/lib/types";

const TOP_STALE_MS = 30_000;

/** The most-blocked domains across every bound Pi-hole. */
export function PiholeTopBlockedCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<PiholeTopBlockedSettingsValue>(
    slotId,
    PIHOLE_TOP_BLOCKED_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("pihole", settings.instanceIds);
  const router = useRouter();

  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: piholeKeys.topDomains(inst.id, true, settings.maxItems),
      queryFn: () => getTopDomains({ blocked: true, count: settings.maxItems }, inst.id),
      staleTime: TOP_STALE_MS,
      refetchInterval: TOP_STALE_MS,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  // Merge by SUMMING per domain. An HA pair of Pi-holes serves different
  // clients, so concatenating would list the same domain twice with two
  // partial counts instead of once with the real total.
  const merged = new Map<string, number>();
  for (const q of queries) {
    const data = q.data as PiholeTopDomainsResponse | undefined;
    for (const entry of data?.domains ?? []) {
      merged.set(entry.domain, (merged.get(entry.domain) ?? 0) + entry.count);
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
    <Card onPress={() => router.push("/(tabs)/pihole")}>
      <CardHeader>
        <CardTitle>Top Blocked Domains</CardTitle>
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Pi-hole instances enabled" />
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

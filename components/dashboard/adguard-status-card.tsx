import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useAdguardDisableFlow } from "@/hooks/use-adguard-disable-flow";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { adguardKeys } from "@/hooks/use-adguard";
import { getStats, getStatus } from "@/services/adguard-api";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import {
  ADGUARD_STATUS_DEFAULT_SETTINGS,
  type AdguardStatusSettingsValue,
} from "@/components/dashboard/widget-settings/adguard-status-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { AdguardServerStatus, AdguardStats } from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

const STATUS_STALE_MS = 10_000;
const STATS_STALE_MS = 30_000;

/**
 * Protection state across every bound AdGuard Home, with the disable/enable
 * control, plus this-window query totals.
 *
 * Two calls per instance rather than Pi-hole's one aggregated /api/padd: AGH
 * has no equivalent combined endpoint, and — unlike Pi-hole's 16-session cap —
 * no seat pressure that would make this worth avoiding.
 */
export function AdguardStatusCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<AdguardStatusSettingsValue>(
    slotId,
    ADGUARD_STATUS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("adguard", settings.instanceIds);
  const router = useRouter();

  const statusQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: adguardKeys.status(inst.id),
      queryFn: () => getStatus(inst.id),
      staleTime: STATUS_STALE_MS,
      refetchInterval: STATUS_STALE_MS,
    })),
  });
  const statsQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: adguardKeys.stats(inst.id),
      queryFn: () => getStats(undefined, inst.id),
      staleTime: STATS_STALE_MS,
      refetchInterval: STATS_STALE_MS,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(statusQueries);

  const totals = statsQueries.reduce(
    (acc, q) => {
      const stats = q.data as AdguardStats | undefined;
      if (!stats) return acc;
      acc.total += stats.num_dns_queries;
      acc.blocked += stats.num_blocked_filtering;
      return acc;
    },
    { total: 0, blocked: 0 },
  );

  // Recomputed, never averaged: averaging a percentage across instances with
  // unequal traffic is simply the wrong number.
  const percentBlocked = totals.total > 0 ? (totals.blocked / totals.total) * 100 : 0;

  const anyDisabled = statusQueries.some(
    (q) => q.data !== undefined && !(q.data as AdguardServerStatus).protection_enabled,
  );
  const allProtectionEnabled = !anyDisabled;

  // Inverted signal, and isLoading:false on purpose (the service-health-card
  // case, #303): during the first probe "nothing known to be wrong" must count
  // as hidden, or the card flashes open on every cold start.
  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenProtectionEnabled,
    isEmpty: instances.length === 0 || allProtectionEnabled,
    isLoading: false,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/adguard")}>
      <CardHeader>
        <CardTitle>AdGuard Home</CardTitle>
        {instances.length > 0 && !isInitialLoading ? (
          <Badge
            label={anyDisabled ? "Disabled" : "Protected"}
            variant={anyDisabled ? "error" : "success"}
          />
        ) : null}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No AdGuard Home instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={2} />
      ) : (
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-x-6 gap-y-1">
            <StatItem label="Queries" value={totals.total.toLocaleString()} />
            <StatItem
              label="Blocked"
              value={totals.blocked.toLocaleString()}
              className="text-danger"
            />
            <StatItem label="Blocked %" value={`${percentBlocked.toFixed(1)}%`} />
          </View>
          {instances.length === 1 ? (
            <AdguardInstanceControl instance={instances[0]!} compact />
          ) : (
            <View className="gap-2">
              {instances.map((inst) => (
                <AdguardInstanceControl key={inst.id} instance={inst} />
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/**
 * One instance's toggle.
 *
 * Its own component because it calls useAdguardDisableFlow(inst.id), and a
 * hook cannot be called inside a .map().
 */
function AdguardInstanceControl({
  instance,
  compact = false,
}: {
  instance: ServiceInstance;
  compact?: boolean;
}) {
  const flow = useAdguardDisableFlow(instance.id);
  // Same key the parent already fetched, so this reads the shared cache rather
  // than issuing a second request per instance.
  const { data } = useQuery({
    queryKey: adguardKeys.status(instance.id),
    queryFn: () => getStatus(instance.id),
    staleTime: STATUS_STALE_MS,
  });

  const enabled = data?.protection_enabled ?? true;

  return (
    <View className={compact ? "" : "flex-row items-center gap-3"}>
      {compact ? null : (
        <Text className="text-zinc-300 text-sm flex-1" numberOfLines={1}>
          {instance.name}
        </Text>
      )}
      {/* One tap in both directions — the widget is the second always-visible
          re-enable path, for someone who never opens the AdGuard Home tab. */}
      <Button
        label={enabled ? "Disable…" : "Enable protection"}
        variant={enabled ? "outline" : "primary"}
        size="sm"
        loading={flow.isPending}
        onPress={enabled ? flow.openDurationSheet : flow.enableNow}
      />
      {flow.modals}
    </View>
  );
}

function StatItem({
  label,
  value,
  className = "text-zinc-300",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className={`text-base font-bold ${className}`}>{value}</Text>
    </View>
  );
}

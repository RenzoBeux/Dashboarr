import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { usePiholeDisableFlow } from "@/hooks/use-pihole-disable-flow";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { piholeKeys } from "@/hooks/use-pihole";
import { getPadd } from "@/services/pihole-api";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import {
  PIHOLE_STATUS_DEFAULT_SETTINGS,
  type PiholeStatusSettingsValue,
} from "@/components/dashboard/widget-settings/pihole-status-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { PiholePadd } from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

const PADD_STALE_MS = 10_000;

/**
 * `blocking` is documented as a string enum, but PADD's payload has carried a
 * bool in some v6 point releases. Normalize defensively — a wrong read here
 * shows a disabled Pi-hole as protected.
 */
function isBlockingEnabled(padd: PiholePadd | undefined): boolean {
  const value = padd?.blocking;
  if (typeof value === "string") return value === "enabled";
  return value === true;
}

/**
 * Blocking state across every bound Pi-hole, with the disable/enable control.
 *
 * Uses GET /api/padd — one aggregated call instead of five — which is worth it
 * for a widget that renders on every dashboard open. Query keys come from
 * piholeKeys so they are byte-identical to the screen's, or each endpoint would
 * be fetched twice per instance.
 */
export function PiholeStatusCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<PiholeStatusSettingsValue>(
    slotId,
    PIHOLE_STATUS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("pihole", settings.instanceIds);
  const router = useRouter();

  const paddQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: piholeKeys.padd(inst.id),
      queryFn: () => getPadd(inst.id),
      staleTime: PADD_STALE_MS,
      refetchInterval: PADD_STALE_MS,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(paddQueries);

  const totals = paddQueries.reduce(
    (acc, q) => {
      const padd = q.data as PiholePadd | undefined;
      if (!padd) return acc;
      acc.total += padd.queries?.total ?? 0;
      acc.blocked += padd.queries?.blocked ?? 0;
      return acc;
    },
    { total: 0, blocked: 0 },
  );

  // Recomputed, never averaged: averaging percent_blocked across instances with
  // unequal traffic is simply the wrong number.
  const percentBlocked = totals.total > 0 ? (totals.blocked / totals.total) * 100 : 0;

  const anyDisabled = paddQueries.some(
    (q) => q.data !== undefined && !isBlockingEnabled(q.data as PiholePadd),
  );
  const allBlockingEnabled = !anyDisabled;

  // Inverted signal, and isLoading:false on purpose (the service-health-card
  // case, #303): during the first probe "nothing known to be wrong" must count
  // as hidden, or the card flashes open on every cold start.
  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenBlockingEnabled,
    isEmpty: instances.length === 0 || allBlockingEnabled,
    isLoading: false,
  });

  return (
    <Card onPress={() => router.push("/(tabs)/pihole")}>
      <CardHeader>
        <CardTitle>Pi-hole</CardTitle>
        {instances.length > 0 && !isInitialLoading ? (
          <Badge
            label={anyDisabled ? "Disabled" : "Blocking"}
            variant={anyDisabled ? "error" : "success"}
          />
        ) : null}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Pi-hole instances enabled" />
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
            <PiholeInstanceControl instance={instances[0]!} compact />
          ) : (
            <View className="gap-2">
              {instances.map((inst) => (
                <PiholeInstanceControl key={inst.id} instance={inst} />
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
 * Its own component because it calls usePiholeDisableFlow(inst.id), and a hook
 * cannot be called inside a .map().
 */
function PiholeInstanceControl({
  instance,
  compact = false,
}: {
  instance: ServiceInstance;
  compact?: boolean;
}) {
  const flow = usePiholeDisableFlow(instance.id);
  const { data } = useQueries({
    queries: [
      {
        queryKey: piholeKeys.padd(instance.id),
        queryFn: () => getPadd(instance.id),
        staleTime: PADD_STALE_MS,
      },
    ],
    combine: (results) => ({ data: results[0]?.data as PiholePadd | undefined }),
  });

  const enabled = isBlockingEnabled(data);

  return (
    <View className={compact ? "" : "flex-row items-center gap-3"}>
      {compact ? null : (
        <Text className="text-zinc-300 text-sm flex-1" numberOfLines={1}>
          {instance.name}
        </Text>
      )}
      {/* One tap in both directions — the widget is the second always-visible
          re-enable path, for someone who never opens the Pi-hole tab. */}
      <Button
        label={enabled ? "Disable…" : "Enable blocking"}
        variant={enabled ? "outline" : "primary"}
        size="sm"
        loading={flow.isPending}
        onPress={enabled ? flow.openDurationSheet : flow.enableNow}
        className={compact ? "" : undefined}
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

import { useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Play } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { toast, toastError } from "@/components/ui/toast";
import { getStats, runAction } from "@/services/custom-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import {
  CUSTOM_STATS_DEFAULT_SETTINGS,
  type CustomStatsSettingsValue,
} from "@/components/dashboard/widget-settings/custom-stats-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { CustomServiceAction, CustomServiceDefinition } from "@/lib/custom-service";
import type { CustomStatResult } from "@/services/custom-api";
import type { ServiceInstance } from "@/store/config-store";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Custom instances are heterogeneous (each describes a different API), so —
// unlike Cleanuparr's summed totals — this card can't aggregate across
// instances into one number. It renders one compact section per bound
// instance instead: its stat tiles plus its action buttons.
export function CustomCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<CustomStatsSettingsValue>(
    slotId,
    CUSTOM_STATS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("custom", settings.instanceIds);
  const router = useRouter();

  const statsQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["custom", inst.id, "stats"] as const,
      queryFn: () => getStats(inst.id),
      staleTime: 30000,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(statsQueries);

  const [confirmTarget, setConfirmTarget] = useState<{
    instanceId: string;
    action: CustomServiceAction;
  } | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const totalStats = statsQueries.reduce((n, q) => n + (q.data?.length ?? 0), 0);
  const totalActions = instances.reduce(
    (n, inst) => n + (inst.custom?.actions?.length ?? 0),
    0,
  );

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || (totalStats === 0 && totalActions === 0),
    isLoading: isInitialLoading,
  });

  const fireAction = async (instanceId: string, action: CustomServiceAction) => {
    setRunningKey(`${instanceId}:${action.id}`);
    try {
      const result = await runAction(instanceId, action.id);
      if (result.status >= 200 && result.status < 300) {
        toast(`${action.label} ran`, "success");
      } else {
        toast(`${action.label} failed (${result.status})`, "error");
      }
    } catch (e) {
      toastError(`Couldn't run ${action.label}`, e);
    } finally {
      setRunningKey(null);
    }
  };

  const handleActionPress = (instanceId: string, action: CustomServiceAction) => {
    if (action.confirm) {
      setConfirmTarget({ instanceId, action });
      setConfirmVisible(true);
      return;
    }
    void fireAction(instanceId, action);
  };

  const confirmRun = () => {
    const target = confirmTarget;
    setConfirmVisible(false);
    if (!target) return;
    void fireAction(target.instanceId, target.action);
  };

  return (
    <Card onPress={() => router.push("/(tabs)/custom")}>
      <CardHeader>
        <CardTitle>Custom Services</CardTitle>
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No custom instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={2} />
      ) : (
        <View className="gap-4">
          {instances.map((inst, i) => (
            <InstanceSection
              key={inst.id}
              instance={inst}
              stats={statsQueries[i]?.data ?? []}
              runningKey={runningKey}
              onActionPress={(action) => handleActionPress(inst.id, action)}
            />
          ))}
        </View>
      )}

      <ConfirmModal
        visible={confirmVisible}
        title="Run action"
        message={`Run "${confirmTarget?.action.label ?? "this action"}" now?`}
        icon={Play}
        confirmLabel="Run"
        onConfirm={confirmRun}
        onCancel={() => setConfirmVisible(false)}
      />
    </Card>
  );
}

function InstanceSection({
  instance,
  stats,
  runningKey,
  onActionPress,
}: {
  instance: ServiceInstance;
  stats: CustomStatResult[];
  runningKey: string | null;
  onActionPress: (action: CustomServiceAction) => void;
}) {
  const def: CustomServiceDefinition = instance.custom ?? {};
  const actions = def.actions ?? [];

  return (
    <View className="gap-2">
      <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
        {instance.name}
      </Text>

      {stats.length === 0 && actions.length === 0 ? (
        <Text className="text-zinc-600 text-xs">No stats or actions configured</Text>
      ) : (
        <>
          {stats.length > 0 && (
            <View className="flex-row flex-wrap gap-x-6 gap-y-1">
              {stats.map((s) => (
                <View key={s.label}>
                  <Text className="text-zinc-500 text-xs">{s.label}</Text>
                  <Text className="text-zinc-100 text-base font-bold">
                    {s.display}
                    {s.unit ? ` ${s.unit}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {actions.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  label={action.label}
                  size="sm"
                  variant="outline"
                  loading={runningKey === `${instance.id}:${action.id}`}
                  onPress={() => onActionPress(action)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
